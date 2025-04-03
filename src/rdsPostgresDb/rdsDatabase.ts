import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";
import { RdsConfig } from "./config";

export function createRdsPostgres(config: RdsConfig) {
    const awsRegion = aws.getRegionOutput();
    const defaultVpc = aws.ec2.getVpc({ default: true });

    if (!config.createRdsPostgres) {
        return {
            clusterEndpoint: pulumi.output("not-created"),
            clusterReaderEndpoint: pulumi.output("not-created"),
            dbNameOutput: pulumi.output("not-created"),
            dbUsername: pulumi.output("not-created"),
            dbPasswordSecret: pulumi.secret("not-created"),
            vpcId: defaultVpc.then(vpc => vpc.id),
            created: pulumi.output(false),
            region: awsRegion.apply(r => r.name),
        };
    }

    const availableZones = aws.getAvailabilityZones({ state: "available" });
    const uniqueId = new random.RandomString("unique-id", {
        length: 8,
        special: false,
        upper: false,
    }).result;

    const az1 = config.availabilityZone1 || availableZones.then(zones => zones.names[0]);
    const az2 = config.availabilityZone2 || availableZones.then(zones => zones.names[1]);

    // Create private subnets
    const privateSubnet1 = new aws.ec2.Subnet(`${config.resourceName}-private-subnet-1`, {
        vpcId: defaultVpc.then(vpc => vpc.id),
        cidrBlock: config.privateSubnet1Cidr!,
        availabilityZone: az1,
        tags: { Name: config.resourceName },
    });

    const privateSubnet2 = new aws.ec2.Subnet(`${config.resourceName}-private-subnet-2`, {
        vpcId: defaultVpc.then(vpc => vpc.id),
        cidrBlock: config.privateSubnet2Cidr!,
        availabilityZone: az2,
        tags: { Name: config.resourceName },
    });

    // Create security group
    const dbSecurityGroup = new aws.ec2.SecurityGroup(`${config.resourceName}-db-security-group`, {
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
        tags: { Name: config.resourceName },
    });

    // Create parameter groups
    const clusterParameterGroup = new aws.rds.ClusterParameterGroup(`${config.resourceName}-cluster-param-group`, {
        family: config.dbEngineVersion!.startsWith("16") ? "aurora-postgresql16" : "aurora-postgresql15",
        description: "Cluster parameter group",
        name: pulumi.interpolate`${config.resourceName}-cluster-pg-${uniqueId}`,
    });

    const instanceParameterGroup = new aws.rds.ParameterGroup(`${config.resourceName}-instance-param-group`, {
        family: config.dbEngineVersion!.startsWith("16") ? "aurora-postgresql16" : "aurora-postgresql15",
        description: "Instance parameter group",
        name: pulumi.interpolate`${config.resourceName}-instance-pg-${uniqueId}`,
    });

    // Create subnet group
    const subnetGroup = new aws.rds.SubnetGroup(`${config.resourceName}db-subnet-group`, {
        name: pulumi.interpolate`${config.resourceName}-db-subnet-group-${uniqueId}`,
        subnetIds: pulumi.all([privateSubnet1.id, privateSubnet2.id]).apply(ids => ids),
        description: "Subnet group for Serverless PostgreSQL",
        tags: { Name: config.resourceName },
    });

    // Create random password
    const dbPassword = new random.RandomPassword(`${config.resourceName}-db-password`, {
        length: 16,
        special: false,
    });

    // Create the Serverless v2 PostgreSQL cluster
    const dbCluster = new aws.rds.Cluster(config.resourceName, {
        clusterIdentifier: config.resourceName,
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: "provisioned",
        engineVersion: config.dbEngineVersion,
        databaseName: config.dbName,
        masterUsername: "postgres",
        masterPassword: dbPassword.result,
        serverlessv2ScalingConfiguration: {
            minCapacity: config.minCapacity ?? 0.5,  // Provide fallback value
            maxCapacity: config.maxCapacity ?? 4.0,  // Provide fallback value
        },
        storageType: "aurora-iopt1",
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: [dbSecurityGroup.id],
        skipFinalSnapshot: true,
        dbClusterParameterGroupName: clusterParameterGroup.name,
        tags: { Name: config.resourceName },
    });

    // Create primary cluster instance
    const dbPrimaryInstance = new aws.rds.ClusterInstance(`${config.resourceName}-primary-instance`, {
        identifier: `${config.resourceName}-primary-instance`,
        clusterIdentifier: dbCluster.id,
        instanceClass: "db.serverless",
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: dbCluster.engineVersion,
        publiclyAccessible: false,
        dbParameterGroupName: instanceParameterGroup.name,
        availabilityZone: az1,
        tags: { Name: config.resourceName },
    });

    // Create read replica instance
    const dbReplicaInstance = new aws.rds.ClusterInstance(`${config.resourceName}-replica-instance`, {
        identifier: `${config.resourceName}-replica-instance`,
        clusterIdentifier: dbCluster.id,
        instanceClass: "db.serverless",
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: dbCluster.engineVersion,
        publiclyAccessible: false,
        dbParameterGroupName: instanceParameterGroup.name,
        promotionTier: 15,
        availabilityZone: az2,
        tags: { Name: config.resourceName },
    }, { dependsOn: [dbPrimaryInstance] });

    return {
        clusterEndpoint: dbCluster.endpoint,
        clusterReaderEndpoint: dbCluster.readerEndpoint,
        dbNameOutput: dbCluster.databaseName,
        dbUsername: dbCluster.masterUsername,
        dbPasswordSecret: pulumi.secret(dbPassword.result),
        vpcId: defaultVpc.then(vpc => vpc.id),
        created: pulumi.output(true),
        region: awsRegion.apply(r => r.name),
    };
}