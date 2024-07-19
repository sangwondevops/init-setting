#!/bin/bash
# shellcheck disable=SC1090

#-----------------------------------------------------------------------------------#
# shell setting
#-----------------------------------------------------------------------------------#
set -euoC pipefail
trap finally EXIT


#-----------------------------------------------------------------------------------#
# global constant variable definition
#-----------------------------------------------------------------------------------#
AWS_DEFAULT_REGION="ap-northeast-1"
SCRIPT_DIR=$(cd "$(dirname "$0")" || exit; pwd)
DEPLOY_ENVS=("dev" "stg" "prd")


#-----------------------------------------------------------------------------------#
# functions
#-----------------------------------------------------------------------------------#
function usage() {
cat <<EOS
  Usage: $0 <env> <frontend/backend/authentication> <app-name> [<image-uri>/<build-contxt> <dockerfile-path>]

    env:
      [REQUIRED]
      This argument is used to specify the deployment environment,
        and dev/stg/prd only can be used.

    app-name:
      [REQUIRED]
      This argument is used to identify the name of the S3 bucket that triggers the pipeline and the name of the ECR.

    image-uri:
      This argument is used to specify image uris,
        for example, 11111111111.dkr.ecr.us-east-1.amazonaws.com/repo-name:tag

    build-contxt:
      This argument is build context of docker build command

    dockerfile-path:
      This argument is the path to the dockerfile to be built.
EOS
  exit 1
}

function parse_arg() {
  local -r env="$1"
  if [[ "$#" -lt 1 ]] || ! (printf '%s\n' "${DEPLOY_ENVS[@]}" | grep -qx "$env"); then
    usage
  fi
}

function error() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')]: $*" >&2
}

function generate_autoscale_script() {
  sed -e "s@<MIN_CAPACITY>@$MIN_CAPACITY@g" "$SCRIPT_DIR/autoscale_sample.sh" > ./autoscale.sh
  sed -i -e "s@<MAX_CAPACITY>@$MAX_CAPACITY@g" ./autoscale.sh
  sed -i -e "s@<TARGET_VALUE>@$TARGET_VALUE@g" ./autoscale.sh

  echo "Grant execute permission to autoscale.sh"
  chmod 700 ./autoscale.sh
}

function get_account_id() {
  echo "Setting AWS AccountID..."
  AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
  # アカウント ID が正しいかチェック
  if [[ $AWS_ACCOUNT_ID =~ ^[0-9]{12}$ ]]; then
    echo "AWS AccountID is ${AWS_ACCOUNT_ID}"
  else
    error "Could not get AWS AccountID."
    exit 1
  fi
}

function generate_image_tag() {
  local -r tag=$(tar cf - "$SCRIPT_DIR/../*" > /dev/null 2>&1 | md5sum | cut -c 1-8)
  echo "$tag"
}

function get_image_uri() {
  local -r app_name="$1"
  local -r tag="$2"
  # local -r repo_name=$(aws ssm get-parameter --name "/$PARAMETER_PREFIX/Repository/$app_name" --query "Parameter.Value" --output text)
  repo_name='my-app-dev' # 검증 때문에 하드코딩 됨. 
  if [[ -z $repo_name ]]; then
      error "Could not get ECR repo such as 'devblea-simplefrontstack-ecsapprepo1234'."
      exit 1
  else
      echo "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$repo_name:$tag"
  fi
}

function login_ecr() {
  if ! aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID".dkr.ecr."$AWS_DEFAULT_REGION".amazonaws.com; then
    error "Failed ECR login"
    exit 1
  fi
}

function push_image() {
  local -r image_uri="$1"
  local -r context="$2"
  local -r dockerfile_path="$3"
  docker build -t "$image_uri" "$context" -f "$dockerfile_path"
  docker push "$image_uri"
}

function get_s3_bucket_name() {
  local -r app_name="$1"

  echo "Setting Pipeline source S3 Bucket..."
  echo "app name : ${app_name}"
  S3_BUCKET=$(aws ssm get-parameter \
    --name "/Hinagiku/TriggerBucket/$app_name" \
    --query "Parameter.Value" \
    --output text)
  if [[ -z $S3_BUCKET ]]; then
      error "Could not get S3 Bucket name."
      exit 1
  else
      echo "S3 Bucket is $S3_BUCKET"
  fi
}

function generate_imagedefinitions() {
cat <<EOS > ./imagedefinitions.json
[
  {
    "name": "image",
    "imageUri": "$IMAGE_URI"
  }
]
EOS
}

function upload_asset_to_s3() {
  local -r config_path="$1"
  echo Deploying to S3 BUCKET...
  generate_imagedefinitions

  local -r _config_dir="$SCRIPT_DIR/../config/$config_path"
  zip -j image.zip \
    "$_config_dir/ecs-service-def.json" \
    "$_config_dir/ecs-task-def.json" \
    "$_config_dir/ecspresso.yml" \
    ./imagedefinitions.json \
    ./autoscale.sh

  if ! aws s3 mv image.zip s3://"$S3_BUCKET"; then
      error "Failed to upload files to S3."
      exit 1
  fi
}

function post_script() {
  rm -f ./autoscale.sh ./imagedefinitions.json
  echo "Delete generated files."
}

function finally() {
  rm -f ./autoscale.sh
}

function main() {
  local -r env="$1"
  local -r config_path="$2"
  local -r app_name="$3"
  echo "Your environment is $env"


  . "$SCRIPT_DIR/../config/parameters/$env.conf"

  generate_autoscale_script

  if [[ "$#" -gt 4 ]]; then
    local -r build_path="$4"
    local -r dockerfile_path="$5"
    get_account_id
    tag="$(generate_image_tag)"
    IMAGE_URI="$(get_image_uri "$app_name" "$tag")"
    login_ecr
    push_image "$IMAGE_URI" "$build_path" "$dockerfile_path"
  else
    IMAGE_URI="$4"
  fi

  get_s3_bucket_name "$app_name"
  upload_asset_to_s3 "$config_path"
  post_script
}


#-----------------------------------------------------------------------------------#
# entrypoint
#-----------------------------------------------------------------------------------#
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  parse_arg "$@"
  main "$@"
fi
