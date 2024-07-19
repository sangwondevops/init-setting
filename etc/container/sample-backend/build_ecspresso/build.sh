#!/bin/bash

AWS_DEFAULT_REGION="ap-northeast-1"
# Front or Back
FRONT_OR_BACK="Back"
# Blue/Greenの場合は"Bg",Rollingの場合は""(空文字)
BG=""

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

# AutoScaleのシェルを作成
sed -e "s@<MIN_CAPACITY>@$MIN_CAPACITY@g" autoscale_sample.sh > autoscale.sh
sed -i -e "s@<MAX_CAPACITY>@$MAX_CAPACITY@g" autoscale.sh
sed -i -e "s@<TARGET_VALUE>@$TARGET_VALUE@g" autoscale.sh

# CodeBuild側で実行できるように権限付与
echo "Grant execute permission to autoscale.sh"
chmod 700 ./autoscale.sh

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
printf '[{\"name\":\"EcsApp\",\"imageUri\":\"%s\"}]' $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG > imagedefinitions.json
zip image.zip ecs-service-def.json ecs-task-def.json ecspresso.yml imagedefinitions.json autoscale.sh
aws s3 cp image.zip s3://$S3_BUCKET
if [ $? -ne 0 ]; then
    echo "Failed to upload files to S3."
    exit 1
fi
