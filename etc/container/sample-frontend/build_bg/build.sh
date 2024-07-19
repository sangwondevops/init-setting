#!/bin/bash

AWS_DEFAULT_REGION="ap-northeast-1"
# Front or Back
FRONT_OR_BACK="Front"
# Blue/Greenの場合は"Bg",Rollingの場合は""(空文字)
BG="Bg"

SCRIPT_DIR=$(cd $(dirname $0); pwd)

# 設定ファイル読み込み
if [ -z "${1}" ]; then
  echo "Please set a argument such as dev/stg/prod"
  exit 1
fi

echo "Your environment is ${1}"
if [ -f "${SCRIPT_DIR}/${1}.conf" ]; then
  . "${SCRIPT_DIR}/${1}.conf"
else
  echo "Could not get a conf file."
  exit 1
fi

# AWSアカウントIDの設定
echo "Setting AWS AccountID..."
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query 'Account' --output text`
# AWSアカウントIDが12桁の数字であるかをチェック
if [[ $AWS_ACCOUNT_ID =~ ^[0-9]{12}$ ]]; then
  echo "AWS AccountID is ${AWS_ACCOUNT_ID}"
else
  echo "Could not get AWS AccountID."
  exit 1
fi

# ECRリポジトリ情報の取得
echo "Setting ECR Repo..."
IMAGE_REPO_NAME=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}${APP_NAME}${FRONT_OR_BACK}AppEcsResources${BG}Ecr')].OutputValue" --output text`
if [[ -z $IMAGE_REPO_NAME ]]; then
    echo "Could not get ECR repo such as 'devblea-simplefrontstack-ecsapprepo1234'."
    exit 1
else
    echo "ECR Repo is ${IMAGE_REPO_NAME}"
fi

# パイプライン用S3バケット情報の取得
echo "Setting Pipeline source S3 Bucket..."
S3_BUCKET=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}${APP_NAME}${FRONT_OR_BACK}App${BG}Pipeline')].OutputValue" --output text`
if [[ -z $S3_BUCKET ]]; then
    echo "Could not get S3 Bucket name."
    exit 1
else
    echo "S3 Bucket is ${S3_BUCKET}"
fi

# ECSタスク実行ロール情報の取得
echo "Setting Task Execution Role..."
EXECUTION_ROLE=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}ECSCommonexecutionRoleArn')].OutputValue" --output text`
if [[ -z $EXECUTION_ROLE ]]; then
    echo "Could not get Task Execution Role ARN."
    exit 1
else
    echo "Execution Role is ${EXECUTION_ROLE}"
fi

# ECSタスク定義情報の取得（CDK側はダミーのため、ECSのAPI経由で取得する）
echo "Setting Task Execution Role..."
TASK_FAMILY=`aws ecs list-task-definition-families --query "families[?contains(@, '${ENV}${PJ_PREFIX}ECS${ENV}${PJ_PREFIX}${APP_NAME}ServiceEcsTask')]" --output text`
if [[ -z $TASK_FAMILY ]]; then
    echo "Could not get Task Family."
    exit 1
else
    echo "Task Family is ${TASK_FAMILY}"
fi

# ECRへログイン
echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
if [ $? -ne 0 ]; then
    echo "Failed ECR login."
    exit 1
fi

# コンテナフォルダのハッシュ値をDockerタグに設定
IMAGE_TAG=`tar cf - $SCRIPT_DIR/../* > /dev/null 2>&1 | md5sum | cut -c 1-8`
echo "echo Building the Docker image..."
cd $SCRIPT_DIR/../
docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .
if [ $? -ne 0 ]; then
    echo "Failed Docker build."
    exit 1
fi
docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG

# Dockerイメージの登録
echo Pushing the Docker image...
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
if [ $? -ne 0 ]; then
    echo "Failed Docker push."
    exit 1
fi

# パイプライン用S3バケットへソースファイルアップロード
echo Deploying to S3 BUCKET...
cd $SCRIPT_DIR
printf '{\"ImageURI\":\"%s\"}' $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG > imageDetail.json
sed -e "s@<EcsTaskExecutionRoleArn>@$EXECUTION_ROLE@" taskdef_template.json > taskdef.json
sed -i -e "s@<EcsTask>@$TASK_FAMILY@" taskdef.json
zip image.zip imageDetail.json taskdef.json appspec.yaml
aws s3 cp image.zip s3://$S3_BUCKET
if [ $? -ne 0 ]; then
    echo "Failed to upload files to S3."
    exit 1
fi
