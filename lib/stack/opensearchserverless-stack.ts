import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchserverless';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
// import * as iam from 'aws-cdk-lib/aws-iam';

export interface OpenSearchServerlessStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class OpenSearchServerlessStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: OpenSearchServerlessStackProps
  ) {
    super(scope, id, props);

    const collection = new opensearch.CfnCollection(
      this,
      cdk.Stack.of(this).stackName + 'collection',
      {
        // name属性が必須項目のためconstructoeのidではなくnameにStack名を設定
        name: cdk.Stack.of(this).stackName.toLowerCase(),
        type: 'SEARCH',
      }
    );

    // OpenSearchドメインに設定するセキュリティグループ、アウトバウンドルールのみ設定
    // インバウンドルールはメソッドを使用して追加する
    // 本コードのサンプルでは、以下2パターンのサンプルを用意しているため、必要に応じてコメントインして使用する
    // 1. 特定セキュリティグループＩＤからの許可：特定のコンテナリソースなどアクセス元リソースが絞れる場合
    // 2. サブネットの指定：特定リソースの絞り込みが難しく、サブネット全体で指定したい場合
    const domainsg = new ec2.SecurityGroup(
      this,
      cdk.Stack.of(this).stackName + 'domainsg',
      {
        vpc: props.vpc,
        allowAllOutbound: true,
      }
    );

    // 1. 特定セキュリティグループIDからの許可 を使用する場合はこちらをコメントイン、 許可するSecurityGroupはpropsなど別スタックやIDで指定する
    // 例:ecs のsecurity group をインバウンドルールに追加
    // domainsg.connections.allowFrom(props.appServerSecurityGroup,ec2.Port.tcp(443));

    // 「2. サブネットの指定」を使用する場合はこちらをコメントイン
    // private subnetのCIDR内からのアクセスをすべて許可するインバウンドルール追加
    // private subnet内に多くのサービスがあり、個別の設定を受け付けるのが難しい場合使用
    //  props.vpc.selectSubnets({ subnets: props.vpc.privateSubnets }).subnets.forEach((x:ec2.ISubnet) => {
    //     domainsg.addIngressRule(ec2.Peer.ipv4(x.ipv4CidrBlock), ec2.Port.tcp(443));
    //   });

    const vpcEndpoint = new opensearch.CfnVpcEndpoint(
      this,
      cdk.Stack.of(this).stackName.toLowerCase() + 'endpoint',
      {
        // name属性が必須項目のためconstructoeのidではなくnameにStack名を設定
        name: cdk.Stack.of(this).stackName.toLowerCase(),
        securityGroupIds: [domainsg.securityGroupId],
        vpcId: props.vpc.vpcId,
        subnetIds: props.vpc.isolatedSubnets.map(({ subnetId }) => subnetId),
      }
    );
    collection.addDependency(vpcEndpoint);

    const netPolicy = new opensearch.CfnSecurityPolicy(
      this,
      cdk.Stack.of(this).stackName.toLowerCase() + 'netpolicy',
      {
        // name属性が必須項目のためconstructoeのidではなくnameにStack名を設定
        name: cdk.Stack.of(this).stackName.toLowerCase(),
        type: 'network',
        policy: `[
	{
		"Rules": [
			{
				"ResourceType": "collection",
				"Resource": [
					"collection/${collection.name}"
				]
			},
			{
				"ResourceType": "dashboard",
				"Resource": [
					"collection/${collection.name}"
				]
			}
		],
		"AllowFromPublic": false,
		"SourceVPCEs": [
			"${vpcEndpoint.attrId}"
		]
	}
]`,
      }
    );
    collection.addDependency(netPolicy);

    const encPolicy = new opensearch.CfnSecurityPolicy(
      this,
      cdk.Stack.of(this).stackName.toLowerCase + 'encpolicy',
      {
        // name属性が必須項目のためconstructoeのidではなくnameにStack名を設定
        name: cdk.Stack.of(this).stackName.toLowerCase(),
        policy: `{"Rules":
      [{
        "ResourceType":"collection",
        "Resource":["collection/${collection.name}"]}],
        "AWSOwnedKey":true}`,
        type: 'encryption',
      }
    );
    collection.addDependency(encPolicy);

    //    特定のIAM RoleからOpenSarchドメインへアクセスを許可する場合は以降のサンプルをコメントインして使用する

    //    OpenSearchを利用するサービスに付与するroleに紐づけるポリシー生成
    //   const rolePolicy = new iam.PolicyStatement({
    //   actions:["es:ESHttp*",],
    //   resources:[collection.attrArn +'/*'],
    //   effect:iam.Effect.ALLOW,
    // });

    //      IAMロールの作成、別Stackから渡してもOK
    // const ecsRole =  new iam.Role(this,cdk.Stack.of(this).stackName +"ecsRole",{
    //     assumedBy:new iam.ServicePrincipal('ecs.amazonaws.com'),
    //   });
    //     ecsRole.addToPolicy(rolePolicy);

    // アクセスポリシーのPrincipalに作成した権限を記述
    // 許可する権限は以下の参考記事よりコレクション内のデータ取得、変更に関する権限のみ付与
    // "aoss:ReadDocument","aoss:WriteDocument","aoss:DeleteIndex",aoss:CreateIndex,aoss:DescribeIndex,aoss:CreateCollectionItems,aoss:DescribeCollectionItems,aoss:DeleteCollectionItems
    // https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-genref.html#serverless-operations
    //     const accessPolicy = new opensearch.CfnAccessPolicy(this,cdk.Stack.of(this).stackName.toLowerCase() +"accesspolicy",{
    // name属性が必須項目のためconstructoeのidではなくnameにStack名を設定
    //    name: cdk.Stack.of(this).stackName.toLowerCase(),
    //       type:"data",
    //       policy:
    //       `[
    // 	{
    // 		"Rules": [
    // 			{
    // 				"Resource": [
    // 					"index/${collection.name}/*"
    // 				],
    // 				"Permission": [
    // 					"aoss:ReadDocument",
    // 					"aoss:WriteDocument",
    // 					"aoss:DeleteIndex",
    // 					"aoss:CreateIndex",
    // 					"aoss:DescribeIndex",
    // 					"aoss:CreateCollectionItems",
    // 					"aoss:DescribeCollectionItems",
    // 					"aoss:DeleteCollectionItems"
    // 				],
    // 				"ResourceType": "index"
    // 			}
    // 		],
    // 		"Principal": [
    // 			"${ecsRole.roleArn}"
    // 		]
    // 	}
    // ]`
    //     });
    //     collection.addDependency(accessPolicy);
  }
}
