# HowTo

[リポジトリの README に戻る](../README.md)

ここでは各種設定の HowTo について記載します。

- [HowTo](#howto)
  - [VisualStudioCode のセットアップ](#visualstudiocode-のセットアップ)
    - [VSCode のインストールと初期設定](#vscode-のインストールと初期設定)
    - [VSCode Extension のインストール](#vscode-extension-のインストール)
  - [Git の pre-commit hook のセットアップ](#git-の-pre-commit-hook-のセットアップ)
    - [simple-git-hooks のセットアップ](#simple-git-hooks-のセットアップ)
    - [git-secrets のインストールと設定](#git-secrets-のインストールと設定)
  - [依存パッケージの最新化](#依存パッケージの最新化)

---

## VisualStudioCode のセットアップ

テキストエディタの選択は任意ですが、ここでは VSCode を使用した場合のセットアップ手順を記述します。他のテキストエディタを使用する場合、以下のツールと連携可能なものを使用することを強く推奨します。

- [EditorConfig](https://editorconfig.org/)
- [Prettier](https://prettier.io/)
- [ESLint](https://eslint.org/)

> NOTE:
>
> コード補完や定義箇所へのジャンプなどは[VSCode のビルトイン機能](https://code.visualstudio.com/docs/languages/typescript)を使って実現されています。他のテキストエディタで同等の機能を使用したい場合は、 [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) をサポートするテキストエディタまたはそのプラグインの利用をご検討ください。

### VSCode のインストールと初期設定

[Visual Studio Code](https://code.visualstudio.com/) よりインストールしてください。

macOS の場合、 [Running Visual Studio Code on macOS](https://code.visualstudio.com/docs/setup/mac) の手順に従い、 `code` コマンドがシェルから実行できるように設定してください。Windows では自動で設定されます。

### VSCode Extension のインストール

後続の手順でこのリポジトリを clone して VSCode で開くと、推奨 Extension のインストールを促されます。ここで _Install_ をクリックます。

![VSCode-Recommended-Extensions](../doc/images/VSCode-Recommended-Extensions.jpg)

この推奨 Extension は `.vscode/extensions.json` で定義されています。この機能の詳細は [Managing Extensions in Visual Studio Code](https://code.visualstudio.com/docs/editor/extension-marketplace#_workspace-recommended-extensions) をご参照ください。

---

## Git の pre-commit hook のセットアップ

### simple-git-hooks のセットアップ

トップディレクトリで以下のコマンドを実行します。

```sh
# トップディレクトリで
npx simple-git-hooks
```

Git の hook が設定され(.git/hooks/pre-commit) コミット前に lint-staged が実行されるようになります。

### git-secrets のインストールと設定

lint-staged では eslint と prettier によるチェックに加え、git-secrets によるチェックが実行されるよう設定されています(package.json)。

[awslabs/git-secrets - GitHub](https://github.com/awslabs/git-secrets) を README に従いインストールしてください。その後、以下のコマンドを実行して git コマンドと連携させます。

```sh
git secrets --register-aws --global
```

次に、ダミーの値として許可される認証情報のリストを登録します。 `~/.gitconfig` を編集し、上述のコマンドによって生成された `[secrets]` セクションを探して以下を追記します。これらは BLEA のソースコード内でダミーとして使用しているアカウント ID です。

```text
    # Fictitious AWS Account ID
    allowed = 111122223333
    allowed = 444455556666
    allowed = 123456789012
    allowed = 777788889999
    allowed = 000000000000
    allowed = 111111111111
    allowed = 222222222222
    allowed = 333333333333
```

> NOTE
>
> `git secrets install` は実行**しない**でください。本プロジェクトでは `simple-git-hooks`を使用して pre-commit をフックし、ここから git-secrets を呼び出しています。 `git secrets install` を実行するとフックが競合します。

---

## 依存パッケージの最新化

最新の CDK を使用する場合は、依存する NPM パッケージをアップデートする必要があります。アップデートの手順は次の通りです。これはトップディレクトリで行います。

```sh
# トップディレクトリで
npm update
```

> NOTE
>
> ここで依存パッケージのバージョン不整合が発生した場合、適宜 package.json を修正します。例えば、`jest` はこのプロジェクトのテストツールとして使用されているため、 package.json に `devDependencies` として記載されています。`aws-cdk` も同様に `jest` に依存しており、 `ncu -u` によって package.json に記載された `jest` のバージョンが `aws-cdk` が必要とするバージョンと一致しなくなるおそれがあります。

---
