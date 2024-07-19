FROM public.ecr.aws/amazonlinux/amazonlinux:2023

COPY ./check_login.sh .

RUN chmod 700 check_login.sh

RUN yum update -y && \
    yum install -y procps && \
    dnf -y localinstall  https://dev.mysql.com/get/mysql80-community-release-el9-1.noarch.rpm && \
    dnf -y install mysql mysql-community-client

ENTRYPOINT ["./check_login.sh"]
