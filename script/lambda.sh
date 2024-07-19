#!/bin/bash

WORKING_DIR=$(pwd)
echo "Current directory is: $WORKING_DIR"
# Load the configuration from the JSON file



SECURITY_GROUP_ID=$(aws ssm get-parameter --name '/Lambda/Lambda-SecurityGroup' --query "Parameter.Value" --output text )
ROLE_ARN=$(aws ssm get-parameter --name '/Lambda/Lambda-Role' --query "Parameter.Value" --output text )
NAME_SPACE_ID=$(aws ssm get-parameter --name '/Lambda/namespace' --query "Parameter.Value" --output text)
SERVICE_ID=$(aws ssm get-parameter --name '/Lambda/serviceId' --query "Parameter.Value" --output text)
INSTANCE_ID='Lambda_App' 
SUBNET_ID=$(aws ssm get-parameter --name "PublicSubnet-0" --query "Parameter.Value" --output text)

# echo "VPC ID: $VPC_ID"
echo "Security Group ID: $SECURITY_GROUP_ID"
echo "Role ARN: $ROLE_ARN"
echo "SUBNET_ID : $SUBNET_ID"


# aws iam put-role-policy --role-name CodeBuildServiceRole --policy-name CodeBuildServiceRolePolicy --policy-document file://$CODEBUILD_SRC_DIR/unzip_folder/create-role-codebuild.json

echo "existed file list is : $(ls -l) via lambda.sh"


LAMBDA_CONFIG_FILE="$CODEBUILD_SRC_DIR/unzip_folder/lambda_function_config.json"

DOCKER_INFO="$CODEBUILD_SRC_DIR/unzip_folder/docker_image_info.json"

if [ -f "$LAMBDA_CONFIG_FILE" ]; then
    echo "Found lambda configuration file: $LAMBDA_CONFIG_FILE"
else
    echo "Error: lambda configuration file not found: $LAMBDA_CONFIG_FILE"
    exit 1
fi

LAMBDA_CONFIG=$(cat $LAMBDA_CONFIG_FILE)

export AWS_DEFAULT_REGION="ap-northeast-1"

FUNCTION_NAME=$(echo $LAMBDA_CONFIG | jq -r '.FunctionName')
MEMORY_SIZE=$(echo $LAMBDA_CONFIG | jq -r '.MemorySize')
TIMEOUT=$(echo $LAMBDA_CONFIG | jq -r '.Timeout')


# Import Docker Info for Iambda Backend

REPO_URL=$(jq -r '.DOCKER_IMAGE_URL' $DOCKER_INFO)
TAG=$(jq -r '.TAG' $DOCKER_INFO)

echo "docker image url : ${REPO_URL}"
echo "Image tag is ${TAG}"

REGION=$AWS_DEFAULT_REGION
echo "AWS Region: $REGION"

API_ID=$(aws cloudformation describe-stacks --stack-name Hinagiku-Dev-apigateway --query "Stacks[0].Outputs[?OutputKey=='ApiId'].OutputValue" --output text)
echo "API Gateway ID: $API_ID"

STATEMENT_ID="apigateway-$(date +%Y%m%d%H%M%S)"
echo "Statement ID: ${STATEMENT_ID}"

ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "Current AWS Account ID: $ACCOUNT_ID"

# Create Lamba OR Update Lambda depends on existed Lambda 
if aws lambda get-function --function-name $FUNCTION_NAME >/dev/null 2>&1; then
    echo "Updating existing Lambda function...";
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --memory-size $MEMORY_SIZE \
        --timeout $TIMEOUT \
        --role $ROLE_ARN \
        --region $REGION \
        --vpc-config "SubnetIds=${SUBNET_ID},SecurityGroupIds=${SECURITY_GROUP_ID}"
    echo "Lambda configuration updated successfully."
    sleep 30  # wait 30 second to Update Lambda Function
    aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --image-uri "${REPO_URL}:${TAG}"
else
    echo "Creating new Lambda function..."
    aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --package-type Image \
    --code ImageUri="${REPO_URL}:${TAG}" \
    --role $ROLE_ARN \
    --memory-size $MEMORY_SIZE \
    --timeout $TIMEOUT \
    --vpc-config "SubnetIds=${SUBNET_ID},SecurityGroupIds=${SECURITY_GROUP_ID}"

fi





aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id $STATEMENT_ID \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*"
if [ $? -ne 0 ]; then
    echo "Error: Failed to add permission to Lambda"
    exit 1
fi

LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --query 'Configuration.FunctionArn' --output text)

INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id $API_ID \
    --integration-type AWS_PROXY \
    --integration-method ANY \
    --integration-uri $LAMBDA_ARN \
    --payload-format-version 2.0 \
    --query 'IntegrationId' \
    --output text)
if [ $? -ne 0 ]; then
    echo "Error: Failed to create API Gateway integration"
    exit 1
fi
echo "Integration ID: $INTEGRATION_ID"

if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 create-stage \
        --api-id $API_ID \
        --stage-name dev \
        --auto-deploy true \
        --region $REGION
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create API Gateway stage"
        exit 1
    fi
fi

if ! aws apigatewayv2 get-routes --api-id "$API_ID" --output json | jq -e '.Items[] | select(.RouteKey == "ANY /{proxy+}")' >/dev/null; then
    aws apigatewayv2 update-stage --api-id $API_ID --stage-name dev --auto-deploy true --region $REGION
    if [ $? -ne 0 ]; then
        echo "Error: Failed to update API Gateway stage"
        exit 1
    fi
fi

echo "Lambda has been created : $FUNCTION_NAME"




### Register API GateWay Endpoint to CloudMap Service Instance

aws servicediscovery register-instance \
    --service-id ${SERVICE_ID} \
    --instance-id $INSTANCE_ID \
    --attributes=AWS_INSTANCE_IPV4=172.2.1.3,AWS_INSTANCE_PORT=8080

<< 'END'
  # Setting the instance port 8080 specifies the port number on which the service instance will receive traffic.
  # In general, port 8080 is used as an alternative port for HTTP traffic and plays the same role as the default HTTP port 80.
  # This setting is part of the internal network settings used by API gateway endpoints to invoke lambda functions
  # By setting the port number to 8080, CloudMap is configured to route incoming traffic from this port to its Lambda function

END



