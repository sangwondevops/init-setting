# csys-infra-aws-hinagiku-renewal

## 開発環境準備

### 前提

- VSCode
- Node.js (>=`18.0.0`)
  - npm (>=`8.1.0`)
  - yarn (>=`1.22.0`)
- Git

1. ソースコード取得

   ```bash
   git clone --recursive git@github.com:mynavi-group/csys-infra-aws-hinagiku-renewal
   ```

1. vscode 拡張機能インストール
   - [このマニュアル](/doc/HowTo.md) を参考にする
1. モジュールインストール

   ```bash
   cd csys-infra-aws-hinagiku-renewal
   npm i
   ```

## デプロイ手順

デプロイ先のアカウントの認証情報を取得していること。  
取得していない場合は[このドキュメント](https://mynavi.docbase.io/posts/2165763#aws-cli%E3%82%84sdk%E3%81%A7%E3%81%AE%E3%83%AD%E3%82%B0%E3%82%A4%E3%83%B3aws-sso%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%AB%E3%81%8B%E3%82%89%E3%82%B3%E3%83%94%E3%83%BC%E3%81%99%E3%82%8B%E6%96%B9%E6%B3%95)を参考に取得する。

1. リポジトリのトップディレクトリに移動

   ```bash
   cd csys-infra-aws-hinagiku-renewal
   ```

1. diff コマンドを実行

   ```bash
   yarn cdk diff <dev/stage/prod> <--all/スタック名>
   # npm で実行する場合は npm run cdk diff <dev/stage/prod> <--all/スタック名>
   ```

1. diff コマンドの結果が問題なければデプロイ実行

   ```bash
   yarn cdk deploy <dev/stage/prod> <--all/スタック名>
   # npm で実行する場合は npm run cdk diff <dev/stage/prod> <--all/スタック名>
   ```
