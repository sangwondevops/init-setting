#!/bin/bash
# shellcheck disable=SC1090

#-----------------------------------------------------------------------------------#
# shell setting
#-----------------------------------------------------------------------------------#
set -euoC pipefail


#-----------------------------------------------------------------------------------#
# global constant variable definition
#-----------------------------------------------------------------------------------#
# SCRIPT_DIR=$(cd "$(dirname "$0")" || exit; pwd)
DEPLOY_ENVS=("dev" "stage" "prod")


#-----------------------------------------------------------------------------------#
# functions
#-----------------------------------------------------------------------------------#
function usage() {
cat <<EOS
  Usage: $0 <command> <env> <--all or Stack Name>
EOS
  exit 1
}

function parse_arg() {
  local -r _env="$2"
  if [[ "$#" -lt 1 ]] || ! (printf '%s\n' "${DEPLOY_ENVS[@]}" | grep -qx "$_env"); then
    usage
  fi
}

function error() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')]: $*" >&2
}

function main() {
  local -r _command="$1"
  local -r _env="$2"

  if [[ $_command == bootstrap ]]; then
    npx cdk "$_command" -c environment="$_env"
  else
    local -r _target="$3"
    local -r _approval=$([[ $_env == dev || $_env == stage ]] && echo "--require-approval never")
    eval "$(echo "npx cdk $_command -c environment=$_env -o cdk.out/$_env $_approval $_target")"
    # npx cdk "$_command" -c environment="$_env" -o cdk.out/"$_env" "$_approval" "$_target"
  fi
}


#-----------------------------------------------------------------------------------#
# entrypoint
#-----------------------------------------------------------------------------------#
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  parse_arg "$@"
  main "$@"
fi
