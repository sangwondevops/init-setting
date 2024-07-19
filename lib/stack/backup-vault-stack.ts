import * as cdk from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as kms from 'aws-cdk-lib/aws-kms';

export interface BackupVaultStackProps extends cdk.StackProps {
  appKey: kms.IKey;
}

export class BackupVaultStack extends cdk.Stack {
  public readonly vault: backup.BackupVault;

  constructor(scope: cdk.App, id: string, props: BackupVaultStackProps) {
    super(scope, id, props);

    const vault = new backup.BackupVault(this, 'Vault', {
      encryptionKey: props.appKey,
    });

    this.vault = vault;
  }
}
