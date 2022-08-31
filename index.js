#!/usr/bin/env node
const { Command } = require("commander");

const program = new Command();
const uploadQCloud = require("qcloud-upload");

program
  .name("q-cloud cli tool")
  .description("CLI to q-cloud upload")
  .version("0.1.0");

program
  .command("upload")
  .description("腾讯桶资源上传命令")
  .option("--SecretId <string>", "SecretId")
  .option("--SecretKey <string>", "SecretKey")
  .option("--Bucket <string>", "Bucket")
  .option("--Region <string>", "Region")
  .option("--prefix <string>", "prefix")
  .option("--overWrite <boolean>", "overWrite", false)
  .option("--src <string>", "src")
  // .option("--AppId", "AppId")
  // .option("--Headers", "Headers")
  .action((str, options) => {
    console.log("options Bucket", options._optionValues);
    uploadQCloud(options._optionValues);
  });

program.parse();
