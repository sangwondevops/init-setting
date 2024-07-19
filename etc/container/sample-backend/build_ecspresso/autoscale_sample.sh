#!/bin/bash

aws application-autoscaling register-scalable-target \
--service-namespace ecs --scalable-dimension ecs:service:DesiredCount \
--resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \
--min-capacity <MIN_CAPACITY> --max-capacity <MAX_CAPACITY>

aws application-autoscaling put-scaling-policy \
--service-namespace ecs --scalable-dimension ecs:service:DesiredCount \
--resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \
--policy-name Test-target-tracking-scaling-policy --policy-type TargetTrackingScaling \
--target-tracking-scaling-policy-configuration '{ "TargetValue": '<TARGET_VALUE>', "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization" }, "ScaleOutCooldown": 60,"ScaleInCooldown": 60}'