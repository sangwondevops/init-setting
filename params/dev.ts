import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import { Duration } from 'aws-cdk-lib';
import * as inf from './interface';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export const CognitoParam: inf.ICognitoParam = {
  urlForCallback: ['http://xxx/auth/callback'],
  urlForLogout: ['http://xxx/auth/logout'],
  secretArn: 'arn:aws:secretsmanager:xxx',
  identityProvider: cognito.UserPoolClientIdentityProvider.GOOGLE,
};

export const WafParam: inf.IWafParam = {
  basicAuthUserName: 'admin',
  basicAuthUserPass: 'pass',
  overrideAction_CommonRuleSet: { count: {} },
  overrideAction_KnownBadInputsRuleSet: { count: {} },
  overrideAction_AmazonIpReputationList: { count: {} },
  overrideAction_LinuxRuleSet: { count: {} },
  overrideAction_SQLiRuleSet: { count: {} },
  overrideAction_CSCRuleSet: { count: {} },
  ruleAction_IPsetRuleSet: { block: {} },
  ruleAction_BasicRuleSet: {
    block: {
      customResponse: {
        responseCode: 401,
        responseHeaders: [
          {
            name: 'www-authenticate',
            value: 'Basic',
          },
        ],
      },
    },
  },
  allowIPList: ['210.190.113.128/25'],
};

export const OidcParam: inf.IOidcParam = {
  OrganizationName: 'OrganizationName',
  RepositoryNames: {
    WafRepositoryName: 'WafRepositoryName',
    InfraRepositoryName: 'InfraRepositoryName',
  },
};

export const OpensearchParam: inf.IOpenSearchParam = {
  engineVersion: opensearch.EngineVersion.OPENSEARCH_1_3,
  zoneAwareness: 3,
  ebsVolumeType: ec2.EbsDeviceVolumeType.GP3,
  ebsVolumeSize: 20,
  ebsIops: 5000,
  dataNodes: 3,
  masterNodes: 3,
  masterNodeInstanceType: 't3.medium.search',
  dataNodeInstanceType: 't3.medium.search',
};

export const ElastiCacheRedisParam: inf.IElastiCacheRedisParam = {
  engineVersion: '7.1',
  numNodeGroups: 1,
  replicasPerNodeGroup: 2,
  minCapacity: 2,
  maxCapacity: 12,
  targetValue: 70,
  enableAutoScale: false,
  cacheNodeTypeEnableAutoScale: 'cache.m5.large',
  cacheNodeTypeDisableAutoScale: 'cache.t3.small',
  elastiCacheRedisCustomParam: {
    cacheParameterGroupFamily: 'redis7',
    description: 'CustomParameterGroupForRedis',
    properties: {
      'cluster-enabled': 'yes',
    },
  },
};

export const AuroraParam: inf.IAuroraParam = {
  dbName: 'mydbname',
  dbUser: 'dbUser',
  instanceTypeWriter: ec2.InstanceType.of(
    ec2.InstanceClass.T3,
    ec2.InstanceSize.MEDIUM
  ),
  instanceTypeReader: ec2.InstanceType.of(
    ec2.InstanceClass.T3,
    ec2.InstanceSize.MEDIUM
  ),
  enablePerformanceInsights: false,
  auroraMinAcu: 2,
  auroraMaxAcu: 16,
  //ParameterGroupforMySQL
  mysqlParamForCluster: {
    time_zone: 'Asia/Tokyo',
    character_set_client: 'utf8mb4',
    character_set_connection: 'utf8mb4',
    character_set_database: 'utf8mb4',
    character_set_results: 'utf8mb4',
    character_set_server: 'utf8mb4',
    init_connect: 'SET NAMES utf8mb4',
  },
  mysqlParamForInstance: {
    slow_query_log: '1',
    long_query_time: '10',
  },
  //ParameterGroupforPostgreSQL
  postgresqlParamForCluster: {
    timezone: 'Asia/Tokyo',
    client_encoding: 'UTF8',
  },
  postgresqlParamForInstance: {
    //「.」があるKey値はプロパティ扱いになるため「'」で括る
    shared_preload_libraries:
      'auto_explain,pg_stat_statements,pg_hint_plan,pgaudit',
    log_statement: 'ddl',
    log_connections: '1',
    log_disconnections: '1',
    log_lock_waits: '1',
    log_min_duration_statement: '5000',
    'auto_explain.log_min_duration': '5000',
    'auto_explain.log_verbose': '1',
    log_rotation_age: '1440',
    log_rotation_size: '102400',
    'rds.log_retention_period': '10080',
    random_page_cost: '1',
    track_activity_query_size: '16384',
    idle_in_transaction_session_timeout: '7200000',
    statement_timeout: '7200000',
    search_path: '"$user",public',
  },
};

//Used when creating front-end stacks
export const CertificateIdentifier: inf.ICertificateIdentifier = {
  identifier: '',
};

export const AlbCertificateIdentifier: inf.ICertificateIdentifier = {
  identifier: '',
};
export const AlbBgCertificateIdentifier: inf.ICertificateIdentifier = {
  identifier: '',
};

// インターネットアクセス可能なECSサービス、タスクのパラメータを設定する
// ・appName：ECSサービスやタスク名に使用する名前
// ・portNumber：コンテナがリクエストを受け付けるポート（HTTPであれば80）
// ・pathが存在しないタスクがデフォルトルールになる。1タスク必ず設定する（0でも2以上でもNG）
// ・path：デフォルトルールでないタスクの場合に必ず設定する、リクエストを振り分けるパスの文字列を設定
// 本サンプルでは2種類のECSサービスを定義し、EcsAppをデフォルトルールを設定している
export const EcsFrontTasks: inf.IEcsAlbParam = [
  {
    appName: 'EcsApp',
    portNumber: 3000,
  },
];

// インターネットアクセス可能なECSサービス、タスクのパラメータを設定する、デプロイはBlue/Greenデプロイとなる
// ・appName：ECSサービスやタスク名に使用する名前
// ・portNumber：コンテナがリクエストを受け付けるポート（HTTPであれば80）
// ・pathが存在しないタスクがデフォルトルールになる。1タスク必ず設定する（0でも2以上でもNG）
// ・path：デフォルトルールでないタスクの場合に必ず設定する、リクエストを振り分けるパスの文字列を設定
// 本サンプルでは2種類のECSサービスを定義し、EcsAppBgをデフォルトルールを設定している
export const EcsFrontBgTasks: inf.IEcsAlbParam = [
  {
    appName: 'EcsAppBg',
    portNumber: 80,
  },
  {
    appName: 'EcsApp2Bg',
    portNumber: 80,
    path: '/path',
  },
];

// VPC内でService Connectを経由して接続するECSサービス、タスクのパラメータを設定する
// ・appName：ECSサービスやタスク名に使用する名前
// ・portNumber：コンテナがリクエストを受け付けるポート（HTTPであれば80）
// 本サンプルでは2種類のECSサービスを定義している
export const EcsBackTasks: inf.IEcsParam[] = [
  {
    appName: 'EcsBackend',
    portNumber: 5000,
  },
];

// VPC内でALBを経由して接続するECSサービス、タスクのパラメータを設定する、デプロイはBlue/Greenデプロイとなる
// ・appName：ECSサービスやタスク名に使用する名前
// ・portNumber：コンテナがリクエストを受け付けるポート（HTTPであれば80）
// ・pathが存在しないタスクがデフォルトルールになる。1タスク必ず設定する（0でも2以上でもNG）
// ・path：デフォルトルールでないタスクの場合に必ず設定する、リクエストを振り分けるパスの文字列を設定
// 本サンプルでは2種類のECSサービスを定義し、EcsBackendBgをデフォルトルールを設定している
export const EcsBackBgTasks: inf.IEcsAlbParam = [
  {
    appName: 'EcsBackendBg',
    portNumber: 8080,
  },
  {
    appName: 'EcsBackend2Bg',
    portNumber: 8080,
    path: '/path',
  },
];

export const EcsAuthTasks: inf.IEcsParam[] = [
  {
    appName: 'Authenticate',
    portNumber: 8000,
  },
];

export const VpcParam: inf.IVpcParam = {
  cidr: '10.100.0.0/16',
  maxAzs: 3,
};

export const NotifierParam: inf.INotifierParam = {
  workspaceId: 'T8XXXXXXX',
  channelIdMon: 'C01YYYYYYYY',
  monitoringNotifyEmail: 'notify-monitoring@example.com',
};

export const CloudFrontParam: inf.ICloudFrontParam = {
  fqdn: '',
  createClosedBucket: false,
};

export const Env: inf.IEnv = {
  envName: 'Dev',
};

export const DRRegionParam: inf.IDRRegion = {
  region: 'ap-southeast-1',
};

// バックアップスケジュールをcron形式で指定
//https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_events.CronOptions.html
//https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-cron-expressions.html
export const BackupParam: inf.IBackupParam = {
  backupDisasterRecovery: false,
  retentionPeriod: Duration.days(14),
  backupSchedule: events.Schedule.cron({
    minute: '0',
    hour: '2',
    day: '*',
    month: '*',
    year: '*',
  }),
};

// CodeBuild完了後にSlackへのステータス通知を行う際に必要な情報
// slackChannelNameはSlackチャンネル名を入力
// slackWorkspaceIdはslackのワークスペースIDを入力
// slackChannelIdはSlackのチャンネルIDを入力
export const InfraResourcesPipelineParam: inf.IInfraResourcesPipelineParam = {
  slackChannelName: 'YOUR_CHANNEL_NAME',
  slackWorkspaceId: 'YOUR_SLACK_WORKSPACE_ID',
  slackChannelId: 'YOUR_SLACK_CHANNEL_ID',
};
