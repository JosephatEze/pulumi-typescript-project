import * as pulumi from "@pulumi/pulumi";
import * as infra from "./src";

const rdsConfig = infra.getConfig();
const rdsResources = infra.createRdsPostgres(rdsConfig);

export const clusterEndpoint = rdsResources.clusterEndpoint;
export const clusterReaderEndpoint = rdsResources.clusterReaderEndpoint;
export const dbNameOutput = rdsResources.dbNameOutput;
export const dbUsername = rdsResources.dbUsername;
export const dbPasswordSecret = rdsResources.dbPasswordSecret;
export const vpcId = rdsResources.vpcId;
export const created = rdsResources.created;
export const region = rdsResources.region;