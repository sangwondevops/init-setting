# HowToUse-maintenance

ここでは、maintenance-on.yml と maintenance-off.yml の利用方法について記載する

## 目的

- アプリ担当者が GitHub 画面上の操作のみで、メンテナンス画面を切り替えられるようにする。

## ワークフローの内容

- maintenance-on.yml
  - IPset ルールの Action を Block に変更
  - Basic 認証ルールの Action を Block に変更
- maintenance-off.yml
  - IPset ルールの Action を Count に変更
  - Basic 認証ルールの Action を Count に変更

## 事前に必要な設定

### AWS 側の設定

- OIDC スタックとその他必要なスタックをデプロイする。

### GitHub 側の設定

- リポジトリの作成

  1. GitHub にアクセスする。
  2. 右上のアイコンをクリックし、「Your repositories」を選択する。
  3. 「New」を選択する。
  4. 「Create a new repository」に遷移し、必要事項を入力する。
  5. 新規リポジトリが作成される。

- ワークフローの作成

  1.  「Actions」タブに遷移し、「New workflow」ボタンを押下する。
  2.  「Simple workflow」というサンプルがあるので「Configure」ボタンを押下し Edit 画面に遷移する。  
       ※この時、yml ファイルが「.github/workflows」配下にあることを確認する。
  3.  Edit 画面にて maintenance-on.yml（または maintenance-off.yml） のコードを張り付ける。

- GitHubSecrets への Role 登録  
  README.md を参照。

## 実行手順

- ワークフローの実行
  1.  「Actions」タブに遷移し、左ペインより「メンテナンス画面表示」(または「通常画面表示」)というワークフローを選択する
  2.  「Run Workflow」のプルダウンを開き「WebACL 名」に値を入力して「Run Workflow」のボタンを押下する。
