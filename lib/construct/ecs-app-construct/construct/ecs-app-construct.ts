import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_kms as kms } from 'aws-cdk-lib';
import { aws_sns as sns } from 'aws-cdk-lib';
import { aws_cloudwatch as cw } from 'aws-cdk-lib';
import { aws_logs as cwl } from 'aws-cdk-lib';
import { aws_cloudwatch_actions as cw_actions } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_ecr as ecr } from 'aws-cdk-lib';
import { aws_events_targets as eventtarget } from 'aws-cdk-lib';
import { aws_ssm as ssm } from 'aws-cdk-lib';

export interface EcsappConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsCluster: ecs.Cluster;
  appName: string;
  prefix: string;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  allowFromSg?: ec2.ISecurityGroup[];
  portNumber: number;
  useServiceConnect?: boolean;
  lambdaSecurityGroup?: ec2.ISecurityGroup;
}

export class EcsappConstruct extends Construct {
  public readonly securityGroupForFargate: ec2.SecurityGroup;
  public readonly serviceConnectLogGroup: cwl.LogGroup;
  public readonly fargateLogGroup: cwl.LogGroup;
  public readonly ecsServiceName: string;
  public readonly appName: string;
  public readonly portNumber: number;

  constructor(scope: Construct, id: string, props: EcsappConstructProps) {
    super(scope, id);

    this.appName = props.appName;
    this.portNumber = props.portNumber;

    // Create a repository
    const repository = new ecr.Repository(this, `Repo`, {
      imageScanOnPush: true,
    });
    const target = new eventtarget.SnsTopic(props.alarmTopic);

    repository.onImageScanCompleted('ImageScanComplete').addTarget(target);

    const securityGroupForFargate = new ec2.SecurityGroup(this, `Sg`, {
      vpc: props.vpc,
      allowAllOutbound: true, // for AWS APIs
    });

    if (props.lambdaSecurityGroup) {
      securityGroupForFargate.connections.allowFrom(
        props.lambdaSecurityGroup,
        ec2.Port.tcp(props.portNumber)
      );
    }

    if (props.allowFromSg) {
      for (const sg of props.allowFromSg) {
        securityGroupForFargate.connections.allowFrom(
          sg,
          ec2.Port.tcp(props.portNumber)
        );
      }
    }

    this.securityGroupForFargate = securityGroupForFargate;

    // CloudWatch Logs Group for Container
    const fargateLogGroup = new cwl.LogGroup(this, `Log`, {
      // 方式設計より保存期間5年とする
      retention: cwl.RetentionDays.FIVE_YEARS,
      encryptionKey: props.appKey,
      logGroupName: cdk.PhysicalName.GENERATE_IF_NEEDED,
    });
    this.fargateLogGroup = fargateLogGroup;

    if (props.useServiceConnect) {
      // CloudWatch Logs Group for Service Connect
      const serviceConnectLogGroup = new cwl.LogGroup(
        this,
        `LogforServiceConnect`,
        {
          // 方式設計より保存期間5年とする
          retention: cwl.RetentionDays.FIVE_YEARS,
          encryptionKey: props.appKey,
          logGroupName: cdk.PhysicalName.GENERATE_IF_NEEDED,
        }
      );
      this.serviceConnectLogGroup = serviceConnectLogGroup;
    }

    this.ecsServiceName = `${props.prefix}-${props.appName}-Service`; //PipelineStackでもこの名前を使用
    new cw.Metric({
      metricName: 'CPUUtilization',
      namespace: 'ECS',
      dimensionsMap: {
        ClusterName: props.ecsCluster.clusterName,
        ServiceName: this.ecsServiceName,
      },
      period: cdk.Duration.minutes(1),
      statistic: cw.Stats.AVERAGE,
    })
      .createAlarm(this, 'FargateCpuUtil', {
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        threshold: 80,
        comparisonOperator:
          cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        actionsEnabled: true,
      })
      .addAlarmAction(new cw_actions.SnsAction(props.alarmTopic));

    cdk.Stack.of(this).exportValue(repository.repositoryName, {
      name: `${this.appName}RepositoryName`,
    });
    new ssm.StringParameter(this, `${props.appName}Repository`, {
      parameterName: `/Hinagiku/Repository/${this.appName}`,
      stringValue: repository.repositoryName,
    });
  }
}
