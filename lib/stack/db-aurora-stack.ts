import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_rds as rds } from 'aws-cdk-lib';
import { aws_kms as kms } from 'aws-cdk-lib';
import { aws_logs as logs } from 'aws-cdk-lib';
import { aws_sns as sns } from 'aws-cdk-lib';
import { aws_cloudwatch as cw } from 'aws-cdk-lib';
import { aws_cloudwatch_actions as cw_actions } from 'aws-cdk-lib';
import { ClusterInstance } from 'aws-cdk-lib/aws-rds';

export interface DbAuroraStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbName: string;
  dbUser: string;
  dbAllocatedStorage: number;
  instanceTypeWriter: ec2.InstanceType;
  instanceTypeReader: ec2.InstanceType;
  enablePerformanceInsights: boolean;
  appKey: kms.IKey;
  vpcSubnets: ec2.SubnetSelection;
  appServerSecurityGroup: ec2.SecurityGroup;
  bastionSecurityGroup?: ec2.SecurityGroup;
  alarmTopic: sns.Topic;
  auroraMinAcu: number;
  auroraMaxAcu: number;
  mysqlParamForCluster: Record<string, string>;
  mysqlParamForInstance: Record<string, string>;
  postgresqlParamForCluster: Record<string, string>;
  postgresqlParamForInstance: Record<string, string>;
}

export class DbAuroraStack extends cdk.Stack {
  public readonly dbClusterName: string;

  constructor(scope: Construct, id: string, props: DbAuroraStackProps) {
    super(scope, id, props);
    // for Aurora PostgreSQL
    const version = rds.AuroraPostgresEngineVersion.VER_15_4;
    const engine = rds.DatabaseClusterEngine.auroraPostgres({
      version,
    });
    const parameterGroupForCluster = new rds.ParameterGroup(
      this,
      'AuroraClusterParameterGroup',
      {
        engine,
        description: 'Aurora-ClusterParameterGroup',
        parameters: props.postgresqlParamForCluster,
      }
    );
    const parameterGroupForInstance = new rds.ParameterGroup(
      this,
      'AuroraInstanceParameterGroup',
      {
        engine,
        description: 'Aurora-InstanceParameterGroup',
        parameters: props.postgresqlParamForInstance,
      }
    );

    // for Aurora MySQL
    // const version = rds.AuroraMysqlEngineVersion.VER_3_02_1;
    // const engine = rds.DatabaseClusterEngine.auroraMysql({
    //   version
    // });
    // const parameterGroupForCluster = new rds.ParameterGroup(this, 'AuroraClusterParameterGroup', {
    //   engine,
    //   description: 'Aurora-ClusterParameterGroup',
    //   parameters: props.mysqlParamForCluster,
    // });
    // const parameterGroupForInstance = new rds.ParameterGroup(this, 'AuroraInstanceParameterGroup', {
    //   engine,
    //   description: 'Aurora-InstanceParameterGroup',
    //   parameters: props.mysqlParamForInstance,
    // });

    // If PerformanceInsights is not used, EncriptionKey, Retention cannot be set.
    const performanceInsightsConfigure = props.enablePerformanceInsights
      ? {
          enablePerformanceInsights: props.enablePerformanceInsights,
          performanceInsightEncryptionKey: props.appKey,
          performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT, // 7 days
        }
      : {
          enablePerformanceInsights: props.enablePerformanceInsights,
        };
    // Create RDS MySQL Instance
    const cluster = new rds.DatabaseCluster(this, 'Aurora', {
      // backtrackWindow: cdk.Duration.days(1),//it can be set only for MySQL
      engine,
      parameterGroup: parameterGroupForCluster,
      credentials: rds.Credentials.fromGeneratedSecret(props.dbUser),
      serverlessV2MaxCapacity: props.auroraMaxAcu,
      serverlessV2MinCapacity: props.auroraMinAcu,
      vpcSubnets: props.vpcSubnets,
      vpc: props.vpc,
      writer: ClusterInstance.serverlessV2('writer', {
        parameterGroup: parameterGroupForInstance,
        //最新版のCAを明示的に指定
        caCertificate: rds.CaCertificate.of('rds-ca-rsa4096-g1'),
        ...performanceInsightsConfigure,
      }),
      readers: [
        ClusterInstance.serverlessV2('reader1', {
          scaleWithWriter: true,
          // scaleWithWriterはServerless V2を選択時に設定可能なパラメータである
          // 下記ドキュメント(https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.ServerlessV2ClusterInstanceProps.html#scalewithwriter)を参考に要件に応じて設定
          // true: The serverless v2 reader will scale to match the writer instance (provisioned or serverless)
          // false: The serverless v2 reader will scale with the read workfload on the instance
          // scaleWithWriter: true,
          parameterGroup: parameterGroupForInstance,
          //最新版のCAを明示的に指定
          caCertificate: rds.CaCertificate.of('rds-ca-rsa4096-g1'),
          ...performanceInsightsConfigure,
        }),
      ],
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      defaultDatabaseName: props.dbName,
      storageEncrypted: true,
      storageEncryptionKey: props.appKey,
      // cloudwatchLogsExports: ['error', 'general', 'slowquery', 'audit'], // For Aurora MySQL
      cloudwatchLogsExports: ['postgresql'], // For Aurora PostgreSQL
      cloudwatchLogsRetention: logs.RetentionDays.THREE_MONTHS,
    });

    cluster.connections.allowDefaultPortFrom(props.appServerSecurityGroup);
    // For Bastion Container
    if (props.bastionSecurityGroup) {
      cluster.connections.allowDefaultPortFrom(props.bastionSecurityGroup);
    }
    this.dbClusterName = cluster.clusterIdentifier;

    // AWS Backupの対象リソースとなるようにタグ付け
    cdk.Tags.of(cluster).add('AWSBackup', 'True');

    // ----------------------- Alarms for RDS -----------------------------

    // Aurora Cluster CPU Utilization
    // cluster
    //   .metricCPUUtilization({
    //     period: cdk.Duration.minutes(1),
    //     statistic: cw.Stats.AVERAGE,
    //   })
    //   .createAlarm(this, 'AuroraCPUUtil', {
    //     evaluationPeriods: 3,
    //     datapointsToAlarm: 3,
    //     threshold: 90,
    //     comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    //     actionsEnabled: true,
    //   })
    //   .addAlarmAction(new cw_actions.SnsAction(props.alarmTopic));

    // Can't find instanceIdentifiers - implement later
    //
    // cluster.instanceIdentifiers.forEach(instance => {
    //   console.log("instance: "+instance);
    //   new cw.Metric({
    //     metricName: 'CPUUtilization',
    //     namespace: 'AWS/RDS',
    //      dimensionsMap: {
    //       DBInstanceIdentifier: instance
    //     },
    //     period: cdk.Duration.minutes(1),
    //     statistic: cw.Stats.AVERAGE,
    //   }).createAlarm(this, 'CPUUtilization', {
    //     evaluationPeriods: 3,
    //     datapointsToAlarm: 2,
    //     threshold: 90,
    //     comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    //     actionsEnabled: true
    //   }).addAlarmAction(new cw_actions.SnsAction(props.alarmTopic));
    // });

    // ----------------------- RDS Event Subscription  -----------------------------
    //   Send critical(see eventCategories) event on all of clusters and instances
    //
    // See: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-rds-eventsubscription.html
    // See: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Events.html
    //
    // To specify clusters or instances, add "sourceType (sting)" and "sourceIds (list)"
    // sourceType is one of these - db-instance | db-cluster | db-parameter-group | db-security-group | db-snapshot | db-cluster-snapshot
    //
    new rds.CfnEventSubscription(this, 'RdsEventsCluster', {
      snsTopicArn: props.alarmTopic.topicArn,
      enabled: true,
      sourceType: 'db-cluster',
      eventCategories: ['failure', 'failover', 'maintenance'],
    });

    new rds.CfnEventSubscription(this, 'RdsEventsInstances', {
      snsTopicArn: props.alarmTopic.topicArn,
      enabled: true,
      sourceType: 'db-instance',
      eventCategories: [
        'availability',
        'configuration change',
        'deletion',
        'failover',
        'failure',
        'maintenance',
        'notification',
        'recovery',
      ],
    });
  }
}
