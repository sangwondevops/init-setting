#!/bin/bash
LOGIN_USER="exist"

while :
do
    sleep 1800
    LOGIN_USER_NUMBER=`ps -ef | grep ssm-session-worker | grep -v grep | wc -l`
    
    if [ $LOGIN_USER_NUMBER != 0 ]; then
        LOGIN_USER="exist"
    else
        if [ $LOGIN_USER = "no_exist" ];then
            exit 0
        else
            LOGIN_USER="no_exist"
        fi
    fi
done
