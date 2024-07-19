import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_sns as sns } from 'aws-cdk-lib';
import { aws_cloudwatch as cw } from 'aws-cdk-lib';
import { aws_cloudwatch_actions as cw_actions } from 'aws-cdk-lib';
import { region_info as ri } from 'aws-cdk-lib';
import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';
import { aws_certificatemanager as acm } from 'aws-cdk-lib';
import { AlbTarget } from './alb-target-group-construct';
import {
  IEcsAlbParam,
  ICertificateIdentifier,
  IOptionalEcsAlbParam,
} from '../../../params/interface';
import { EcsappConstruct } from '../ecs-app-construct/construct/ecs-app-construct';

interface AlbConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  alarmTopic: sns.Topic;
  albCertificateIdentifier: ICertificateIdentifier;
  ecsApps?: IEcsAlbParam;
}

export class AlbConstruct extends Construct {
  public readonly appAlb: elbv2.ApplicationLoadBalancer;
  public readonly appAlbListerner: elbv2.ApplicationListener;
  public readonly appAlbSecurityGroup: ec2.SecurityGroup;
  public readonly webContentsBucket: s3.Bucket;
  public readonly cfDistribution: cloudfront.Distribution;
  public readonly ecsAlbApps: EcsappConstruct[];
  public readonly targetGroupConstructs: AlbTarget[];

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    //Check if a certificate is specified
    const hasValidAlbCert = props.albCertificateIdentifier.identifier !== '';

    // for ELB (Local regional Cert)
    const albCertificateArn = `arn:aws:acm:${cdk.Stack.of(this).region}:${
      cdk.Stack.of(this).account
    }:certificate/${props.albCertificateIdentifier.identifier}`;
    const albCert = acm.Certificate.fromCertificateArn(
      this,
      'albCertificate',
      albCertificateArn
    );

    // --- Security Groups ---

    //Security Group of ALB for App
    const securityGroupForAlb = new ec2.SecurityGroup(this, 'SgAlb', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    this.appAlbSecurityGroup = securityGroupForAlb;

    // ------------ Application LoadBalancer ---------------

    // ALB for App Server
    const lbForApp = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: securityGroupForAlb,
      vpcSubnets: props.vpc.selectSubnets({
        subnetGroupName: 'Public',
      }),
    });
    this.appAlb = lbForApp;

    let lbForAppListener: elbv2.ApplicationListener;
    let defaultListenerlistenedPort: number;
    if (hasValidAlbCert) {
      defaultListenerlistenedPort = 443;
      lbForAppListener = lbForApp.addListener('app', {
        port: defaultListenerlistenedPort,
        certificates: [
          {
            certificateArn: albCert.certificateArn,
          },
        ],
        sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
        open: false,
      });

      const redirectListenerListenedPort = 80;
      // (mynavi mod) create redirect listener.
      const redirectListener = lbForApp.addListener('redirect', {
        port: redirectListenerListenedPort,
        defaultAction: elbv2.ListenerAction.redirect({
          port: '443',
          protocol: 'HTTPS',
          permanent: true,
        }),
        open: false,
      });
      redirectListener.node.addDependency(lbForAppListener);
    } else {
      defaultListenerlistenedPort = 80;
      lbForAppListener = lbForApp.addListener('app', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        open: false,
      });
    }
    this.appAlbListerner = lbForAppListener;

    const cfManagedPrefixIpListId = 'pl-58a04531';
    securityGroupForAlb.connections.allowFrom(
      ec2.Peer.prefixList(cfManagedPrefixIpListId),
      ec2.Port.tcp(defaultListenerlistenedPort)
    );
    securityGroupForAlb.connections.allowFrom(
      ec2.Peer.ipv4('210.190.113.128/25'),
      ec2.Port.tcp(defaultListenerlistenedPort)
    );

    // Enable ALB Access Logging
    //
    // This bucket can not be encrypted with KMS CMK
    // See: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html#access-logging-bucket-permissions
    //
    const albLogBucket = new s3.Bucket(this, 'alb-log-bucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    lbForApp.setAttribute('access_logs.s3.enabled', 'true');
    lbForApp.setAttribute('access_logs.s3.bucket', albLogBucket.bucketName);

    // Permissions for Access Logging
    //    Why don't use bForApp.logAccessLogs(albLogBucket); ?
    //    Because logAccessLogs add wider permission to other account (PutObject*). S3 will become Noncompliant on Security Hub [S3.6]
    //    See: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-standards-fsbp-controls.html#fsbp-s3-6
    //    See: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html#access-logging-bucket-permissions
    albLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        // ALB access logging needs S3 put permission from ALB service account for the region
        principals: [
          new iam.AccountPrincipal(
            ri.RegionInfo.get(cdk.Stack.of(this).region).elbv2Account
          ),
        ],
        resources: [
          albLogBucket.arnForObjects(`AWSLogs/${cdk.Stack.of(this).account}/*`),
        ],
      })
    );
    albLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        resources: [
          albLogBucket.arnForObjects(`AWSLogs/${cdk.Stack.of(this).account}/*`),
        ],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
        },
      })
    );
    albLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetBucketAcl'],
        principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        resources: [albLogBucket.bucketArn],
      })
    );

    // Alarm for ALB - ResponseTime
    lbForApp.metrics
      .targetResponseTime({
        period: cdk.Duration.minutes(1),
        statistic: cw.Stats.AVERAGE,
      })
      .createAlarm(this, 'AlbResponseTime', {
        evaluationPeriods: 3,
        threshold: 100,
        comparisonOperator:
          cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        actionsEnabled: true,
      })
      .addAlarmAction(new cw_actions.SnsAction(props.alarmTopic));

    // Alarm for ALB - HTTP 4XX Count
    lbForApp.metrics
      .httpCodeElb(elbv2.HttpCodeElb.ELB_4XX_COUNT, {
        period: cdk.Duration.minutes(1),
        statistic: cw.Stats.SUM,
      })
      .createAlarm(this, 'AlbHttp4xx', {
        evaluationPeriods: 3,
        threshold: 10,
        comparisonOperator:
          cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        actionsEnabled: true,
      })
      .addAlarmAction(new cw_actions.SnsAction(props.alarmTopic));

    // Alarm for ALB - HTTP 5XX Count
    lbForApp.metrics
      .httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT, {
        period: cdk.Duration.minutes(1),
        statistic: cw.Stats.SUM,
      })
      .createAlarm(this, 'AlbHttp5xx', {
        evaluationPeriods: 3,
        threshold: 10,
        comparisonOperator:
          cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        actionsEnabled: true,
      })
      .addAlarmAction(new cw_actions.SnsAction(props.alarmTopic));

    if (props.ecsApps != undefined) {
      this.targetGroupConstructs = props.ecsApps.map((ecsApp, index) => {
        return new AlbTarget(this, `${ecsApp.appName}-TargetGroup`, {
          vpc: props.vpc,
          alarmTopic: props.alarmTopic,
          appAlbListener: lbForAppListener,
          path: (ecsApp as IOptionalEcsAlbParam).path,
          priority: index,
        });
      });
    }
  }
}
