# HowToUse-InfraResources

ここでは、InfraResources_RunTest.yml と InfraResources_ExecutePipeline.yml の利用方法について記載する

## 目的

- InfraResources CDKDeploy コマンド実行前のテスト実行と S3 配置の実施を行うため。

## ワークスペースの内容

- InfraResources_RunTest.yml
  - cdk ls の実施
  - test.sh の実行
- InfraResources_ExecutePipeline.yml
  - デプロイ用ファイル群の zip 化
  - S3 への zip ファイル配置

## 事前に必要な設定

### AWS 側の設定

- mynv-pipeline-infraresources-stack と OIDC スタックのデプロイ

### Github 側の設定

- リポジトリの作成

  1.  GitHub にアクセスする。
  1.  右上のアイコンをクリックし、「Your repositories」を選択する。
  1.  「New」を選択する。
  1.  「Create a new repository」に遷移し、必要事項を入力する。
  1.  新規リポジトリが作成される。

- ワークフローの作成  
  ワークフローはコピーして作成したリポジトリに各ワークフローファイルが配置されることで、自動的に作成される。

- yml ファイルへの入力情報

  下記を参照しながら必要情報を入力。

  - InfraResources_RunTest.yml
    ```
    env:
      envkey: 先頭小文字環境名
    on:
      pull_request:
        branches: ['Merge先ブランチ名']
        paths-ignore:
          - 'README.md' #対象外ファイル指定
    ```
    envkey は`-c environment=`の後ろの部分。
  - InfraResources_ExecutePipeline.yml

    ```
      push:
        branches: ['Merge先ブランチ名']
        paths: ['lib/**', 'bin/**', 'params/**'] #トリガー対象ファイル指定箇所
    env:
      AWS_REGION: ap-northeast-1
      PIPELINE_STACK_NAME: 'デプロイ時に指定したPipeline名'
    ```

- GitHub GithubVariables への Role 登録　　
  [README.md](./README.md)を参照。

## 実行手順

- InfraResources_RunTest.yml

  Merge 元のリポジトリから Merge 先リポジトリへのプルリクエストを作成することで実行される。

- InfraResources_ExecutePipeline.yml

  対象ブランチのファイルに変更(Merge)が実施されたタイミングに実行される。
