import * as pulumi from "@pulumi/pulumi";

export interface RdsConfig {
    createRdsPostgres?: boolean;
    resourceName: string;
    dbName: string;
    dbEngineVersion?: string;
    minCapacity: number;
    maxCapacity: number;
    privateSubnet1Cidr?: string;
    privateSubnet2Cidr?: string;
    availabilityZone1?: string;
    availabilityZone2?: string;
}

export function getConfig(): RdsConfig {
    const config = new pulumi.Config();
    return {
        createRdsPostgres: config.getBoolean("createRdsPostgres") || false,
        resourceName: config.require("resourceName"),
        dbName: config.require("dbName"),
        dbEngineVersion: config.get("dbEngineVersion") || "16.6",
        minCapacity: config.getNumber("minCapacity") || 0.5,
        maxCapacity: config.getNumber("maxCapacity") || 4.0,
        privateSubnet1Cidr: config.get("privateSubnet1Cidr") || "172.31.100.0/24",
        privateSubnet2Cidr: config.get("privateSubnet2Cidr") || "172.31.101.0/24",
        availabilityZone1: config.get("availabilityZone1"),
        availabilityZone2: config.get("availabilityZone2"),
    };
}