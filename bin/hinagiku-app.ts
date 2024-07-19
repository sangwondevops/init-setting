import * as cdk from 'aws-cdk-lib';
import { DbAuroraStack } from '../lib/stack/db-aurora-stack';
import { WafStack } from '../lib/stack/waf-stack';
import { ElastiCacheRedisStack } from '../lib/stack/elasticache-redis-stack';
import * as fs from 'fs';
import { IConfig, IEnv } from '../params/interface';
// import { MonitorStack } from '../lib/stack/monitor-stack';
import { EcsAppStack } from '../lib/stack/ecs-app-stack';
import { CloudfrontStack } from '../lib/stack/cloudfront-stack';
import { OidcStack } from '../lib/stack/oidc-stack';
// import { InfraResourcesPipelineStack } from '../lib/stack/pipeline-infraresources-stack';
import { ShareResourcesStack } from '../lib/stack/share-resources-stack';

const app = new cdk.App();

// ----------------------- Types ------------------------------
type CtxEnvironment = 'dev' | 'stage' | 'prod';

// ----------------------- Functions ------------------------------

function getCtxVariable(): CtxEnvironment {
  const argContext = 'environment';
  const envKey = app.node.tryGetContext(argContext);
  if (envKey == undefined)
    throw new Error(
      `Please specify environment with context option. ex) cdk deploy -c ${argContext}=dev`
    );

  return envKey;
}

function getConfig(deployEnv: CtxEnvironment): IConfig {
  const tsEnvPath = './params/' + deployEnv + '.ts';
  if (!fs.existsSync(tsEnvPath)) {
    throw new Error(
      `Can't find a ts environment file [../params/${deployEnv}.ts]`
    );
  }

  return require('../params/' + deployEnv); // eslint-disable-line @typescript-eslint/no-var-requires
}

// Define account id and region from context.
// If "env" isn't defined on the environment variable in context, use account and region specified by "--profile".
function getProcEnv(env: IEnv): cdk.Environment {
  return {
    account: env.account ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: env.region ?? process.env.CDK_DEFAULT_REGION,
  };
}

// ----------------------- App Variables ------------------------------

const ctxEnvironment: CtxEnvironment = getCtxVariable();
const config: IConfig = getConfig(ctxEnvironment);
const systemName = 'Hinagiku';
const pjPrefix = `${systemName}-${config.Env.envName}`;
const deployEnv: cdk.Environment = getProcEnv(config.Env);

// ----------------------- Stacks ------------------------------

// Slack Notifier
// const workspaceId = config.NotifierParam.workspaceId;
// const channelIdMon = config.NotifierParam.channelIdMon;

const shareResources = new ShareResourcesStack(
  app,
  `${pjPrefix}-ShareResources`,
  {
    pjPrefix,
    // chatbotProps: {
    //   notifyEmail: config.NotifierParam.monitoringNotifyEmail,
    //   workspaceId: workspaceId,
    //   channelId: channelIdMon,
    // },
    cognitoProps: {
      domainPrefix: `${pjPrefix}`.toLowerCase(),
      ...config.CognitoParam,
    },
    vpcCidr: config.VpcParam.cidr,
    vpcMaxAzs: config.VpcParam.maxAzs,
    env: deployEnv,
  }
);

// InfraResources
// new InfraResourcesPipelineStack(app, `${pjPrefix}-Pipeline`, {
//   ...config.InfraResourcesPipelineParam,
//   env: ctxEnvironment,
// });

// const waf = new WafStack(app, `${pjPrefix}-Waf`, {
//   scope: 'CLOUDFRONT',
//   env: {
//     account: deployEnv.account,
//     region: 'us-east-1',
//   },
//   crossRegionReferences: true,
//   ...config.WafParam,
//   pjPrefix: pjPrefix,
// });

// new OidcStack(app, `${pjPrefix}-Oidc`, {
//   organizationName: config.OidcParam.OrganizationName,
//   repositoryNames: config.OidcParam.RepositoryNames,
// });

const webApp = new EcsAppStack(app, `${pjPrefix}-Ecs`, {
  vpc: shareResources.vpc,
  appKey: shareResources.appKey,
  alarmTopic: shareResources.alarmTopic,
  prefix: pjPrefix,
  // albCertificateIdentifier: config.AlbCertificateIdentifier,
  ecsFrontTasks: config.EcsFrontTasks,
  ecsBackTasks: config.EcsBackTasks,
  ecsAuthTasks: config.EcsAuthTasks,
  env: deployEnv,
  crossRegionReferences: true,
  ecsBastionTasks: false,
});

// new CloudfrontStack(app, `${pjPrefix}-CloudFront`, {
//   pjPrefix: pjPrefix,
//   webAcl: waf.webAcl,
//   CertificateIdentifier: config.CertificateIdentifier,
//   cloudFrontParam: config.CloudFrontParam,
//   appAlbs: [webApp.alb.appAlb],
//   env: deployEnv,
//   crossRegionReferences: true,
// });

// Aurora
const dbCluster = new DbAuroraStack(app, `${pjPrefix}-Aurora`, {
  vpc: shareResources.vpc,
  dbAllocatedStorage: 25,
  vpcSubnets: shareResources.vpc.selectSubnets({
    subnetGroupName: 'Protected',
  }),
  appServerSecurityGroup: webApp.ecs.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.app.backEcsAppsBg[0].securityGroupForFargate,
  // bastionSecurityGroup: webApp.ecs.bastionApp.securityGroup,
  appKey: shareResources.appKey,
  alarmTopic: shareResources.alarmTopic,
  ...config.AuroraParam,
  env: deployEnv,
});

// new MonitorStack(app, `${pjPrefix}-MonitorStack`, {
//   pjPrefix: `${pjPrefix}`,
//   alarmTopic: shareResources.alarmTopic,
//   appEndpoint: 'https://demo-endpoint.com',
//   dashboardName: `${pjPrefix}-EcsApp`,
//   cfDistributionId: cloudfront.cfDistributionId,
//   albFullName: webApp.alb.appAlb.loadBalancerFullName,
//   appTargetGroupNames: webApp.alb.targetGroupConstructs.map((target) => target.targetGroup.targetGroupName),
//   albTgUnHealthyHostCountAlarms: webApp.alb.targetGroupConstructs.map((target) => target.albTgUnHealthyHostCountAlarm),
//   ecsClusterName: webApp.ecs.ecsCommon.ecsCluster.clusterName,
//   ecsAlbServiceNames: webApp.ecs.frontEcsApps.map((app) => app.ecsServiceName),
//   ecsInternalServiceNames: webApp.ecs.backEcsApps.map((app) => app.ecsServiceName),
//   dbClusterName: dbCluster.dbClusterName,
//   // AutoScaleはCDK外で管理のため、固定値を修正要で設定
//   ecsScaleOnRequestCount: 50,
//   ecsTargetUtilizationPercent: 10000,
//   env: deployEnv,
// });

new ElastiCacheRedisStack(app, `${pjPrefix}-Redis`, {
  vpc: shareResources.vpc,
  appKey: shareResources.appKey,
  alarmTopic: shareResources.alarmTopic,
  appServerSecurityGroup: webApp.ecs.backEcsApps[0].securityGroupForFargate,
  bastionSecurityGroup: webApp.ecs.bastionApp?.securityGroup,
  ...config.ElastiCacheRedisParam,
  env: deployEnv,
});

// --------------------------------- Tagging  -------------------------------------

// Tagging "Environment" tag to all resources in this app
const envTagName = 'Environment';
cdk.Tags.of(app).add(envTagName, config.Env.envName);

// --------------------------- ssm parameter store--------------------------

//  new ssm.StringParameter(this, `${pjPrefix}-Ecs`,{
//    paramtername :`${pjPrefix}-Ecs`,
//    stringValue : webApp
// })
