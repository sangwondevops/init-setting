#!/bin/bash

# aws sts get-caller-identity
# chmod +x ./init.sh 

echo "install awscli version 2"

curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version

echo "install kubectl"

curl -O https://s3.us-west-2.amazonaws.com/amazon-eks/1.27.4/2023-08-16/bin/linux/amd64/kubectl
chmod +x ./kubectl
mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$HOME/bin:$PATH
kubectl version --client=true --short=true

echo "install eksctl"

curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv -v /tmp/eksctl /usr/local/bin
eksctl version


# Create eks cluter 
#eksctl create cluster -f create-cluster.yaml

# Delete eks cluter 
#eksctl delete cluster -f create-cluster.yaml

# kubectl get ns

# dev
#kubectl get pods -n my-app-dev
#kubectl get services -n my-app-dev

# qa
#kubectl get pods -n my-app-qa
#kubectl get services -n my-app-qa

# staging
#kubectl get pods -n my-app-staging
#kubectl get services -n my-app-staging

# prod
#kubectl get pods -n my-app-prod
#kubectl get services -n my-app-prod

