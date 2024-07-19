import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import {
  ICertificateIdentifier,
  ICloudFrontParam,
} from '../../params/interface';

interface CloudFrontConstructProps extends cdk.StackProps {
  webAcl?: wafv2.CfnWebACL;
  cloudFrontParam: ICloudFrontParam;
  CertificateIdentifier: ICertificateIdentifier;
  appAlbs: elbv2.ApplicationLoadBalancer[];
}

export class CloudFrontConstruct extends Construct {
  public readonly cfDistributionId: string;

  constructor(scope: Construct, id: string, props: CloudFrontConstructProps) {
    super(scope, id);

    //Check if a certificate is specified
    const hasValidAlbCert = props.CertificateIdentifier.identifier !== '';
    //Check if a FQDN is specified
    const hasValidFqdn = props.cloudFrontParam.fqdn !== '';
    //Flag SSL enabled/disabled
    const sslFlag = hasValidAlbCert && hasValidFqdn;

    // ------------------------------------------------------------------------
    // Certificates
    //
    // Note:  CloudFront and ALB need certificate with the same FQDN

    // for cloudfront (us-east-1 Cert)
    const cfCertificateArn = `arn:aws:acm:us-east-1:${
      cdk.Stack.of(this).account
    }:certificate/${props.CertificateIdentifier.identifier}`;
    const cloudfrontCert = acm.Certificate.fromCertificateArn(
      this,
      'cfCertificate',
      cfCertificateArn
    );

    // ------------ S3 Bucket for Web Contents ---------------
    // This bucket cannot be encrypted with KMS CMK
    // See: https://aws.amazon.com/premiumsupport/knowledge-center/s3-website-cloudfront-error-403/
    //
    const webContentBucket = new s3.Bucket(this, 'WebBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    const closedBucket = new s3.Bucket(this, 'ClosedBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // --------- CloudFront Distrubution
    if (props.cloudFrontParam.createClosedBucket) {
      const cfDistribution = new cloudfront.Distribution(this, 'Distribution', {
        defaultBehavior: {
          origin: new origins.S3Origin(closedBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },

        // Domain and SSL Certificate
        ...(sslFlag
          ? {
              domainNames: [props.cloudFrontParam.fqdn],
              certificate: cloudfrontCert,
            }
          : {}),

        // logging
        enableLogging: true,
        logBucket: new s3.Bucket(this, 'CloudFrontLogBucket', {
          accessControl: s3.BucketAccessControl.PRIVATE,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          enforceSSL: true,
          objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
        }),
        logIncludesCookies: true,
        logFilePrefix: 'CloudFrontAccessLogs/',
      });
      this.cfDistributionId = cfDistribution.distributionId;
    } else {
      const cfDistribution = new cloudfront.Distribution(this, 'Distribution', {
        defaultBehavior: {
          origin: new origins.LoadBalancerV2Origin(props.appAlbs[0], {
            protocolPolicy: sslFlag
              ? cloudfront.OriginProtocolPolicy.HTTPS_ONLY
              : cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        additionalBehaviors: {
          //2個目のALBターゲットを指定する場合はパスを指定する
          /*
          '/backend2nd/*': {
            origin: new origins.LoadBalancerV2Origin(props.appAlbs[1], {
              protocolPolicy: sslFlag
                ? cloudfront.OriginProtocolPolicy.HTTPS_ONLY
                : cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
          },
          */
          '/static/*': {
            origin: new origins.S3Origin(webContentBucket),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          },
        },
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 403,
            responsePagePath: '/static/sorry.html',
            ttl: cdk.Duration.seconds(20),
          },
        ],
        defaultRootObject: '', // Need for SecurityHub Findings CloudFront.1 compliant

        // Domain and SSL Certificate
        ...(sslFlag
          ? {
              domainNames: [props.cloudFrontParam.fqdn],
              certificate: cloudfrontCert,
            }
          : {}),

        // WAF defined on us-east-1
        webAclId: props.webAcl?.attrArn,

        // logging
        enableLogging: true,
        logBucket: new s3.Bucket(this, 'CloudFrontLogBucket', {
          accessControl: s3.BucketAccessControl.PRIVATE,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          enforceSSL: true,
          objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
        }),
        logIncludesCookies: true,
        logFilePrefix: 'CloudFrontAccessLogs/',
      });
      this.cfDistributionId = cfDistribution.distributionId;
    }
  }
}
