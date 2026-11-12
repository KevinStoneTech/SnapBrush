const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const appOutDir = context.appOutDir;

  // Lista de arquivos pesados do Chromium que o SnapBrush não precisa para rodar
  const unnecessaryFiles = [
    'LICENSES.chromium.html',
    'vk_swiftshader.dll',
    'vk_swiftshader_icd.json',
    'vulkan-1.dll'
  ];

  for (const file of unnecessaryFiles) {
    const filePath = path.join(appOutDir, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }
  }

  // Remove pacotes de idiomas estrangeiros da pasta locales, mantendo apenas pt-BR e en-US
  const localesDir = path.join(appOutDir, 'locales');
  if (fs.existsSync(localesDir)) {
    const files = fs.readdirSync(localesDir);
    for (const file of files) {
      if (!['pt-BR.pak', 'en-US.pak'].includes(file)) {
        try {
          fs.unlinkSync(path.join(localesDir, file));
        } catch (e) {}
      }
    }
  }
};