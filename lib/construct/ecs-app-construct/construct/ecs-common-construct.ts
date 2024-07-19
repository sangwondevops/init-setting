import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_sns as sns } from 'aws-cdk-lib';
import { aws_events as cwe } from 'aws-cdk-lib';
import { aws_events_targets as cwet } from 'aws-cdk-lib';
import { aws_servicediscovery as sd } from 'aws-cdk-lib';

export interface EcsCommonConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  alarmTopic: sns.Topic;
  prefix: string;
}

export class EcsCommonConstruct extends Construct {
  public readonly ecsCluster: ecs.Cluster;
  public readonly ecsTaskExecutionRole: iam.Role;
  public readonly ecsNameSpace: sd.INamespace;

  constructor(scope: Construct, id: string, props: EcsCommonConstructProps) {
    super(scope, id);

    // --------------------- Fargate Cluster ----------------------------

    // ---- PreRequesties

    // Role for ECS Agent
    // The task execution role grants the Amazon ECS container and Fargate agents permission to make AWS API calls on your behalf.
    // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
    const executionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
      inlinePolicies: {
        createLogs:
          // For Service Connect, ECS Agent need to create CW Logs groups
          new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['logs:CreateLogGroup'],
                resources: ['*'],
              }),
            ],
          }),
      },
    });
    this.ecsTaskExecutionRole = executionRole;

    // ---- Cluster definition

    // Fargate Cluster
    // -  Enabling CloudWatch ContainerInsights
    const ecsCluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
      clusterName: cdk.PhysicalName.GENERATE_IF_NEEDED, // for crossRegionReferences
    });
    this.ecsCluster = ecsCluster;

    // ----------------------- Event notification for ECS -----------------------------
    // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_cwe_events.html#ecs_service_events
    new cwe.Rule(this, 'ECSServiceActionEventRule', {
      description:
        'CloudWatch Event Rule to send notification on ECS Service action events.',
      enabled: true,
      eventPattern: {
        source: ['aws.ecs'],
        detailType: ['ECS Service Action'],
        detail: {
          eventType: ['WARN', 'ERROR'],
        },
      },
      targets: [new cwet.SnsTopic(props.alarmTopic)],
    });

    // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_cwe_events.html#ecs_service_deployment_events
    new cwe.Rule(this, 'ECSServiceDeploymentEventRule', {
      description:
        'CloudWatch Event Rule to send notification on ECS Service deployment events.',
      enabled: true,
      eventPattern: {
        source: ['aws.ecs'],
        detailType: ['ECS Deployment State Change'],
        detail: {
          eventType: ['WARN', 'ERROR'],
        },
      },
      targets: [new cwet.SnsTopic(props.alarmTopic)],
    });

    // タスク定義設定用スクリプトのためOutput
    new cdk.CfnOutput(this, 'executionRoleArn', {
      value: executionRole.roleArn,
    });

    //クラスター名をOutput（run_task.shが参照）
    new cdk.CfnOutput(this, 'clusterName', {
      value: ecsCluster.clusterName,
    });
  }
}
