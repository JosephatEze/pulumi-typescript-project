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



/**
 * Creates an RDS PostgreSQL database cluster with optional read replica
 * @param {RdsConfig} config - Configuration object for the RDS instance
 * @returns {Object} An object containing all created resources and their properties
 * @property {pulumi.Output<string>} clusterEndpoint - The cluster endpoint
 * @property {pulumi.Output<string>} clusterReaderEndpoint - The reader endpoint for the cluster
 * @property {pulumi.Output<string>} dbNameOutput - The name of the database
 * @property {pulumi.Output<string>} dbUsername - The master username
 * @property {pulumi.Output<string>} dbPasswordSecret - The master password (secret)
 * @property {pulumi.Output<string>} vpcId - The VPC ID
 * @property {pulumi.Output<boolean>} created - Whether resources were created
 * @property {pulumi.Output<string>} region - The AWS region
 */