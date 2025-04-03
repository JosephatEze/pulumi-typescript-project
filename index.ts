import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

// Configuration inputs
const config = new pulumi.Config();
const createRdsPostgres = config.getBoolean("createRdsPostgres") || false;
const resourceName = config.require("resourceName");

// Get AWS region from provider configuration
const awsRegion = aws.getRegionOutput();

// Get the default VPC (needed for both cases)
const defaultVpc = aws.ec2.getVpc({ default: true });

// Only create RDS resources if createRdsPostgres is true
const rdsResources = createRdsPostgres ? (() => {
    const dbName = config.require("dbName");
    const dbEngineVersion = config.get("dbEngineVersion") || "16.6";
    const minCapacity = config.getNumber("minCapacity") || 0.5;
    const maxCapacity = config.getNumber("maxCapacity") || 4.0;

    // Generate a unique identifier for this deployment
    const uniqueId = new random.RandomString("unique-id", {
        length: 8,
        special: false,
        upper: false,
    }).result;

    // Get available AZs in the region
    const availableZones = aws.getAvailabilityZones({
        state: "available",
    });

    // Create private subnets in the default VPC
    const privateSubnet1 = new aws.ec2.Subnet(`${resourceName}-private-subnet-1`, {
        vpcId: defaultVpc.then(vpc => vpc.id),
        cidrBlock: "172.31.100.0/24",
        availabilityZone: availableZones.then(zones => zones.names[0]),
        tags: { Name: resourceName },
    });

    const privateSubnet2 = new aws.ec2.Subnet(`${resourceName}-private-subnet-2`, {
        vpcId: defaultVpc.then(vpc => vpc.id),
        cidrBlock: "172.31.101.0/24",
        availabilityZone: availableZones.then(zones => zones.names[1]),
        tags: { Name: resourceName },
    });

    // Create security group
    const dbSecurityGroup = new aws.ec2.SecurityGroup(`${resourceName}-db-security-group`, {
        vpcId: defaultVpc.then(vpc => vpc.id),
        description: "Security group for Serverless PostgreSQL",
        ingress: [{
            protocol: "tcp",
            fromPort: 5432,
            toPort: 5432,
            cidrBlocks: [defaultVpc.then(vpc => vpc.cidrBlock)],
            description: "Allow PostgreSQL access from within the VPC",
        }],
        egress: [{
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }],
        tags: { Name: resourceName },
    });

    // Create parameter groups
    const clusterParameterGroup = new aws.rds.ClusterParameterGroup(`${resourceName}-cluster-param-group`, {
        family: dbEngineVersion.startsWith("16") ? "aurora-postgresql16" : "aurora-postgresql15",
        description: "Cluster parameter group",
        name: pulumi.interpolate`${resourceName}-cluster-pg-${uniqueId}`,
    });

    const instanceParameterGroup = new aws.rds.ParameterGroup(`${resourceName}-instance-param-group`, {
        family: dbEngineVersion.startsWith("16") ? "aurora-postgresql16" : "aurora-postgresql15",
        description: "Instance parameter group",
        name: pulumi.interpolate`${resourceName}-instance-pg-${uniqueId}`,
    });

    // Create subnet group
    const subnetGroup = new aws.rds.SubnetGroup(`${resourceName}-db-subnet-group`, {
        name: pulumi.interpolate`${resourceName}-db-subnet-group-${uniqueId}`,
        subnetIds: pulumi.all([privateSubnet1.id, privateSubnet2.id]).apply(ids => ids),
        description: "Subnet group for Serverless PostgreSQL",
        tags: { Name: resourceName },
    });

    // Create random password
    const dbPassword = new random.RandomPassword(`${resourceName}-db-password`, {
        length: 16,
        special: false,
    });

    // Create the Serverless v2 PostgreSQL cluster
    const dbCluster = new aws.rds.Cluster(`${resourceName}`, {
        clusterIdentifier: resourceName,
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: "provisioned",
        engineVersion: dbEngineVersion,
        databaseName: dbName,
        masterUsername: "postgres",
        masterPassword: dbPassword.result,
        serverlessv2ScalingConfiguration: {
            minCapacity: minCapacity,
            maxCapacity: maxCapacity,
        },
        storageType: "aurora-iopt1",
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: [dbSecurityGroup.id],
        skipFinalSnapshot: true,
        dbClusterParameterGroupName: clusterParameterGroup.name,
        tags: { Name: resourceName },
    });

    // Create primary cluster instance
    const dbPrimaryInstance = new aws.rds.ClusterInstance(`${resourceName}-primary-instance`, {
        identifier: `${resourceName}-primary-instance`,
        clusterIdentifier: dbCluster.id,
        instanceClass: "db.serverless",
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: dbCluster.engineVersion,
        publiclyAccessible: false,
        dbParameterGroupName: instanceParameterGroup.name,
        availabilityZone: availableZones.then(zones => zones.names[0]),
        tags: { Name: resourceName },
    });

    // Create read replica instance
    const dbReplicaInstance = new aws.rds.ClusterInstance(`${resourceName}-replica-instance`, {
        identifier: `${resourceName}-replica-instance`,
        clusterIdentifier: dbCluster.id,
        instanceClass: "db.serverless",
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: dbCluster.engineVersion,
        publiclyAccessible: false,
        dbParameterGroupName: instanceParameterGroup.name,
        promotionTier: 15,
        availabilityZone: availableZones.then(zones => zones.names[1]),
        tags: { Name: resourceName },
    }, { dependsOn: [dbPrimaryInstance] });

    return {
        clusterEndpoint: dbCluster.endpoint,
        clusterReaderEndpoint: dbCluster.readerEndpoint,
        dbNameOutput: dbCluster.databaseName,
        dbUsername: dbCluster.masterUsername,
        dbPasswordSecret: pulumi.secret(dbPassword.result),
    };
})() : {
    clusterEndpoint: pulumi.output("not-created"),
    clusterReaderEndpoint: pulumi.output("not-created"),
    dbNameOutput: pulumi.output("not-created"),
    dbUsername: pulumi.output("not-created"),
    dbPasswordSecret: pulumi.secret("not-created"),
};

// Export outputs
export const clusterEndpoint = rdsResources.clusterEndpoint;
export const clusterReaderEndpoint = rdsResources.clusterReaderEndpoint;
export const dbNameOutput = rdsResources.dbNameOutput;
export const dbUsername = rdsResources.dbUsername;
export const dbPasswordSecret = rdsResources.dbPasswordSecret;
export const vpcId = defaultVpc.then(vpc => vpc.id);
export const created = pulumi.output(createRdsPostgres);
export const region = awsRegion.apply(r => r.name);  