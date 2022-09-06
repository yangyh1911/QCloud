const fs = require("fs");
const path = require("path");
const COS = require("cos-nodejs-sdk-v5");
const Q = require("q");
const ndir = require("ndir");
const assign = require("object-assign");
const chalk = require("chalk");
const { exit } = require("process");
const log = console.log;

module.exports = function (config = {}) {
  config = assign(
    {
      AppId: "",
      SecretId: "",
      SecretKey: "",
      Bucket: "",
      Region: "",
      prefix: "",
      overWrite: false,
      Headers: false,
      src: "",
      dirPath: "",
      distDirName: "",
    },
    config
  );

  if (config.Bucket.indexOf("-") === -1) {
    config.Bucket += "-" + config.AppId;
  }

  let existFiles = 0;
  let uploadedFiles = 0;
  let uploadedFail = 0;
  let tasks = [];
  let errFiles = [];
  let retryNum = 0;

  const cos = new COS({
    SecretId: config.SecretId,
    SecretKey: config.SecretKey,
  });

  let srcPath = path.resolve(path.parse(process.argv[1]).dir, config.src);
  if (!config.src) {
    log(
      chalk.yellow(
        "dirPath API 即将废弃，请升级配置信息，更多内容请访问 https://github.com/yingye/qcloud-upload"
      )
    );
    srcPath = config.dirPath;
  }

  ndir.walk(
    srcPath,
    // 遍历文件夹，读取上传文件
    function onDir(dirpath, files) {
      for (let i = 0, l = files.length; i < l; i++) {
        const info = files[i];
        if (info[1].isFile()) {
          if (config.src) {
            upload(info[0].substring(srcPath.length), info[0]);
          } else {
            upload(
              info[0].substring(info[0].indexOf(config.distDirName)),
              info[0]
            );
          }
        }
      }
    },
    // 执行上传任务
    function end() {
      if (tasks.length !== 0) {
        runTasks();
      }
    },
    function error(err, errPath) {
      log(
        chalk.red("Please you check your Dir option, and use absolute path.")
      );
      log("err: ", errPath, " error: ", err);
      exit(1);
    }
  );

  // 异步上传任务执行控制
  function runTasks() {
    Q.allSettled(tasks).then(
      function (fulfilled) {
        log(
          "Upload to qcloud: Total:",
          chalk.green(fulfilled.length),
          "Skip:",
          chalk.gray(existFiles),
          "Upload:",
          chalk.green(uploadedFiles),
          "Failed:",
          chalk.red(uploadedFail)
        );
        // 重试上传失败文件
        if (uploadedFail > 0) {
          if (retryNum > 2) {
            log(chalk.red("Max retry , exit."));
            exit(1);
          }
          retryNum++;
          log(
            "Retry to upload failed files: Total:",
            chalk.green(uploadedFail)
          );
          existFiles = 0;
          uploadedFiles = 0;
          uploadedFail = 0;
          tasks = [];
          errFiles.forEach((item) => {
            upload(item.fileRelativePath, item.filePath);
          });
          errFiles = [];
          runTasks();
        }
      },
      function (err) {
        // 全部失败直接退出
        log(chalk.red("Failed upload files:"), chalk.red(err));
        exit(1);
      }
    );
  }

  // 装载异步上传任务
  function upload(fileRelativePath, filePath) {
    // 兼容 windows 系统分隔符 \\
    const fileKey = path
      .join(config.prefix, fileRelativePath)
      .split(path.sep)
      .join("/");
    const handler = function () {
      const defer = Q.defer();
      upload();

      function check(callback) {
        cos.headObject(
          {
            Bucket: config.Bucket,
            Region: config.Region,
            Key: fileKey,
          },
          function (err, data) {
            if (err) {
              callback(false);
            } else {
              log("Exist " + fileKey);
              callback(200 == data.statusCode);
            }
          }
        );
      }

      function putFile() {
        let obj = assign(config.Headers || {}, {
          Bucket: config.Bucket,
          Region: config.Region,
          Key: fileKey,
          ContentLength: fs.statSync(filePath).size,
          Body: fs.createReadStream(filePath),
          onProgress(progressData) {
            // console.log(progressData)
          },
        });
        cos.putObject(obj, function (err, data) {
          if (err) {
            uploadedFail++;
            log("err-putObject", err);
            // 上传错误后记录下，用于重试
            errFiles.push({ fileRelativePath, filePath });
            defer.reject();
          } else {
            uploadedFiles++;
            log(chalk.green("Upload " + fileKey + " Success"));
            defer.resolve();
          }
        });
      }

      function upload() {
        if (!config.overWrite) {
          check(function (status) {
            if (status) {
              existFiles++;
              defer.resolve();
            } else {
              putFile();
            }
          });
        } else {
          putFile();
        }
      }
      return defer.promise;
    };

    tasks.push(handler());
  }
};
