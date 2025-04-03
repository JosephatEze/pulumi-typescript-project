passphrase= mygig

setting up s3 backent
create bucket if not existing
aws s3 mb s3://cs-pulumi-state

Enable versioning and encryption (optional but recommended):
aws s3api put-bucket-versioning --bucket cs-pulumi-state --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket cs-pulumi-state --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

Configure Pulumi to use the S3 backend:
select each stack and run this respectively:
pulumi login s3://cs-pulumi-state/dev/
pulumi login s3://cs-pulumi-state/staging/
pulumi login s3://cs-pulumi-state/prod/

To get the value of db master password after creation
pulumi stack output dbPasswordSecret --show-secrets 

To see the value of all secrets
pulumi stack output --show-secrets


