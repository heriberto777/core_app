const path = require("path");

function getFilePath(file) {
  const filePath = file.path;
  const fileSplit = filePath.split(path.sep); // Reemplazar split() por path.sep

  return `${fileSplit[1]}/${fileSplit[2]}`;
}

function getFilePath2(file) {
  const filePath = file.path;
  const fileSplit = filePath.split("/");

  return `${fileSplit[1]}/${fileSplit[2]}`;
}

module.exports = {
  getFilePath,
  getFilePath2,
};
