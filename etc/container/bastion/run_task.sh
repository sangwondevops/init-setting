#!/bin/bash

#変数設定
ENV=<環境名を入力>
PJ_PREFIX=<PREFIX名を入力>
REGION=ap-northeast-1

# リソース名取得
echo "Get resource name"
CLUSTER_NAME=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}ECSCommonCluster')].OutputValue" --output text`
echo "ClusterName is" $CLUSTER_NAME
TASK_DEFINITION=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}BastionECSAPPtaskdefName')].OutputValue" --output text`
echo "TaskDefinition is" $TASK_DEFINITION
SECURITYGROUP_ID=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-ECS --query "Stacks[*].Outputs[? contains(OutputKey, '${ENV}${PJ_PREFIX}BastionECSAPPsecurityGroupId')].OutputValue" --output text`
echo "SG is" $SECURITYGROUP_ID
SUBNET_ID=`aws cloudformation describe-stacks --stack-name ${ENV}${PJ_PREFIX}-Vpc --query "Stacks[*].Outputs[? contains(OutputKey, 'subnetID')].OutputValue" --output text`
echo "SubnetId is" $SUBNET_ID

# 最新タスク定義のARN取得
TASK_DEFINITION_ARN=$(aws ecs describe-task-definition --region $REGION \
  --task-definition $TASK_DEFINITION --query 'taskDefinition.taskDefinitionArn' | sed -e "s/\"//g")

# 踏み台コンテナを起動
echo "Running bastion container..."
TASK_ID=$(aws ecs run-task --region ap-northeast-1 \
  --cluster $CLUSTER_NAME \
  --count 1 \
  --enable-execute-command \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=['$SUBNET_ID'],securityGroups=['$SECURITYGROUP_ID'],assignPublicIp=DISABLED}' \
  --platform-version 1.4.0 \
  --task-definition $TASK_DEFINITION_ARN \
  --query 'tasks[0].taskArn' | awk -F'[/]' '{print $3}' | sed -e "s/\"//g")

# 起動したタスクの情報を取得
TASK_STATUS=$(aws ecs describe-tasks --region ap-northeast-1 \
  --cluster $CLUSTER_NAME \
  --tasks  $TASK_ID \
  --query 'tasks[0].lastStatus' | sed -e "s/\"//g")

# コンテナが起動するまで待機
while [ $TASK_STATUS != "RUNNING" ]
do
  sleep 5
  TASK_STATUS=$(aws ecs describe-tasks --region ap-northeast-1 \
  --cluster $CLUSTER_NAME \
  --tasks  $TASK_ID \
  --query 'tasks[0].lastStatus' | sed -e "s/\"//g")

  RUNTIME_ID=$(aws ecs describe-tasks --region ap-northeast-1 \
  --cluster $CLUSTER_NAME \
  --tasks  $TASK_ID \
  --query 'tasks[0].containers[0].runtimeId' | sed -e "s/\"//g")

    echo "Waiting for container status is running..."
done

echo "task successfully started"
echo "-------------------------------------------"
echo "踏み台コンテナへログインするコマンド"
echo aws ssm start-session --region ap-northeast-1 --target ecs:${CLUSTER_NAME}_${TASK_ID}_${RUNTIME_ID}
echo "-------------------------------------------"
echo "RDSエンドポイント一覧を表示するコマンド"
echo aws rds describe-db-cluster-endpoints --region ap-northeast-1 --query 'DBClusterEndpoints'
echo ""
echo "RDSへポートフォワードするコマンド"
echo aws ssm start-session --region ap-northeast-1 --target ecs:${CLUSTER_NAME}_${TASK_ID}_${RUNTIME_ID} \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<接続したいRDSのエンドポイントを入力>"],"portNumber":["<接続したいRDSのエンドポイントをポート番号を入力>"], "localPortNumber":["<接続する自身のポート番号を入力>"]}'
echo "-------------------------------------------"


