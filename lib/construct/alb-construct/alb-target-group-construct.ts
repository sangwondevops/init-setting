import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';

export interface AlbTargetProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  alarmTopic: sns.Topic;
  appAlbListener: elbv2.ApplicationListener;
  path?: string;
  priority?: number;
}

export class AlbTarget extends Construct {
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly albTgUnHealthyHostCountAlarm: cw.Alarm;

  constructor(scope: Construct, id: string, props: AlbTargetProps) {
    super(scope, id);

    const targetGroup = new elbv2.ApplicationTargetGroup(this, `TargetGroup`, {
      targetType: elbv2.TargetType.IP,
      protocol: elbv2.ApplicationProtocol.HTTP,
      deregistrationDelay: cdk.Duration.seconds(30),
      vpc: props.vpc,
      healthCheck: {
        path: '/login',
        // TODO: Time to timeout must be reviewed.
        timeout: cdk.Duration.seconds(29),
      },
    });
    this.targetGroup = targetGroup;

    if (props.path) {
      props.appAlbListener.addTargetGroups(`${props.path}-AddTarget`, {
        targetGroups: [targetGroup],
        conditions: [elbv2.ListenerCondition.pathPatterns([props.path])],
        priority: props.priority,
      });
    } else {
      // default rule
      props.appAlbListener.addTargetGroups(`AddTarget`, {
        targetGroups: [targetGroup],
      });
    }

    // Alarm for ALB TargetGroup - HealthyHostCount
    targetGroup.metrics
      .healthyHostCount({
        period: cdk.Duration.minutes(1),
        statistic: cw.Stats.AVERAGE,
      })
      .createAlarm(this, `AlbTgHealthyHostCount`, {
        evaluationPeriods: 3,
        threshold: 1,
        comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
        actionsEnabled: true,
      })
      .addAlarmAction(new cw_actions.SnsAction(props.alarmTopic));

    // Alarm for ALB TargetGroup - UnHealthyHostCount
    // This alarm will be used on Dashbaord
    this.albTgUnHealthyHostCountAlarm = targetGroup.metrics
      .unhealthyHostCount({
        period: cdk.Duration.minutes(1),
        statistic: cw.Stats.AVERAGE,
      })
      .createAlarm(this, `AlbTgUnHealthyHostCount`, {
        evaluationPeriods: 3,
        threshold: 1,
        comparisonOperator:
          cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        actionsEnabled: true,
      });
    this.albTgUnHealthyHostCountAlarm.addAlarmAction(
      new cw_actions.SnsAction(props.alarmTopic)
    );
  }
}
