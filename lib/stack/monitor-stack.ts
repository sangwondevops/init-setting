import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_cloudwatch as cw } from 'aws-cdk-lib';
import { Dashboard } from '../construct/dashboard-construct';
import { ITopic } from 'aws-cdk-lib/aws-sns';

interface MonitorStackProps extends cdk.StackProps {
  pjPrefix: string;
  alarmTopic: ITopic;
  appEndpoint: string;
  dashboardName: string;
  cfDistributionId: string;
  albFullName: string;
  appTargetGroupNames: string[];
  albTgUnHealthyHostCountAlarms: cw.Alarm[];
  ecsClusterName: string;
  ecsAlbServiceNames: string[];
  ecsInternalServiceNames: string[];
  ecsTargetUtilizationPercent: number;
  ecsScaleOnRequestCount: number;
  dbClusterName: string;
}

export class MonitorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitorStackProps) {
    super(scope, id, props);

    // Dashboard
    new Dashboard(this, `${props.pjPrefix}-Dashboard`, {
      dashboardName: props.dashboardName,
      cfDistributionId: props.cfDistributionId,
      albFullName: props.albFullName,
      appTargetGroupNames: props.appTargetGroupNames,
      albTgUnHealthyHostCountAlarms: props.albTgUnHealthyHostCountAlarms,
      ecsClusterName: props.ecsClusterName,
      ecsAlbServiceNames: props.ecsAlbServiceNames,
      ecsInternalServiceNames: props.ecsInternalServiceNames,
      dbClusterName: props.dbClusterName,
      // AutoScaleはCDK外で管理のため、固定値を修正要で設定
      ecsScaleOnRequestCount: props.ecsScaleOnRequestCount,
      ecsTargetUtilizationPercent: props.ecsTargetUtilizationPercent,
      // canaryDurationAlarm: canary.canaryDurationAlarm,
      // canaryFailedAlarm: canary.canaryFailedAlarm,
    });
  }
}
