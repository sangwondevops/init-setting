import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
// IAMロールで許可する場合など、IAMリソースを使う場合はコメントイン
// import * as iam from 'aws-cdk-lib/aws-iam';

export interface ModuleStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  engineVersion: opensearch.EngineVersion;
  zoneAwareness: number;
  ebsVolumeType: ec2.EbsDeviceVolumeType;
  ebsVolumeSize: number;
  ebsIops: number;
  dataNodes: number;
  masterNodes: number;
  masterNodeInstanceType: string;
  dataNodeInstanceType: string;
  appServerSecurityGroup: ec2.SecurityGroup;
  bastionSecurityGroup?: ec2.SecurityGroup;
}

export class OpenSearchStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: ModuleStackProps) {
    super(scope, id, props);

    // OpenSearchドメインに設定するセキュリティグループ、アウトバウンドルールのみ設定
    // インバウンドルールはメソッドを使用して追加する
    // 本コードのサンプルでは、以下2パターンのサンプルを用意しているため、必要に応じてコメントインして使用する
    // 1. 特定セキュリティグループＩＤからの許可：特定のコンテナリソースなどアクセス元リソースが絞れる場合
    // 2. サブネットの指定：特定リソースの絞り込みが難しく、サブネット全体で指定したい場合
    const domainsg = new ec2.SecurityGroup(this, 'domainsg', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    // 1. 特定セキュリティグループＩＤからの許可 を使用する場合はこちらをコメントイン、 許可するSecurityGroupはpropsなど別スタックやIDで指定する
    // 例:ecs のsecurity group をインバウンドルールに追加
    // domainsg.connections.allowFrom(props.appServerSecurityGroup,ec2.Port.tcp(443));
    // For Bastion Container
    if (props.bastionSecurityGroup) {
      domainsg.connections.allowFrom(
        props.bastionSecurityGroup,
        ec2.Port.tcp(443)
      );
    }

    // 「2. サブネットの指定」を使用する場合はこちらをコメントイン
    // private subnetのCIDR内からのアクセスをすべて許可するインバウンドルール追加
    // private subnet内に多くのサービスがあり、個別の設定を受け付けるのが難しい場合使用
    //  props.vpc.selectSubnets({ subnets: props.vpc.privateSubnets }).subnets.forEach((x:ec2.ISubnet) => {
    //     domainsg.addIngressRule(ec2.Peer.ipv4(x.ipv4CidrBlock), ec2.Port.tcp(443));
    //   });

    new opensearch.Domain(this, cdk.Stack.of(this).stackName + 'OpenSearch', {
      version: props.engineVersion,
      vpc: props.vpc,
      zoneAwareness: {
        availabilityZoneCount: props.zoneAwareness,
        enabled: true,
      },
      ebs: {
        enabled: true,
        volumeSize: props.ebsVolumeSize,
        volumeType: props.ebsVolumeType,
        iops: props.ebsIops,
      },
      securityGroups: [domainsg],
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
      capacity: {
        dataNodes: props.dataNodes,
        masterNodes: props.masterNodes,
        dataNodeInstanceType: props.dataNodeInstanceType,
        masterNodeInstanceType: props.masterNodeInstanceType,
      },
      encryptionAtRest: { enabled: true },
      enableVersionUpgrade: true,
      tlsSecurityPolicy: opensearch.TLSSecurityPolicy.TLS_1_2,
      enforceHttps: true,
      logging: {
        slowIndexLogEnabled: true,
        appLogEnabled: true,
        slowSearchLogEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 特定のIAM RoleからOpenSarchドメインへアクセスを許可する場合は以降のサンプルをコメントインして使用する

    // OpenSearchを利用するサービスに付与するroleに紐づけるポリシー生成
    //   const rolePolicy = new iam.PolicyStatement({
    //   actions:["es:ESHttp*",],
    //   resources:[domain.domainArn +'/*'],
    //   effect:iam.Effect.ALLOW,
    // });

    //  IAMロールの作成、別Stackから渡してもOK
    //  const ecsRole =  new iam.Role(this,"ecsRole",{
    //       assumedBy:new iam.ServicePrincipal('ecs.amazonaws.com'),
    //       managedPolicies:[rolePolicy]
    //     });

    // actionsでOpenSarch内のインデックスデータへアクセスが必要となる[ESHTTP*]を許可している。
    // 実行できるメソッドは以下の五種類でドメインそのものや設定に関する権限は付与せず、OpenSearch内のデータの読み書きのみ許可
    // ESHttpDelete ESHttpGet ESHttpPatch ESHttpPost ESHttpPut
    // https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ac.html#ac-reference
    //  const esPolicy = new iam.PolicyStatement({
    //   actions:["es:ESHttp*",],
    //   resources:[domain.domainArn +'/*'],
    //   principals:[batchRole],
    //   effect:iam.Effect.ALLOW,
    // });
    // domain.addAccessPolicies(esPolicy);
  }
}
