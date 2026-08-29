const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function logError(msg) {
  console.error(msg);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    logError('Usage: node ua-project-scan.js <project-root> <output-file>');
  }
  const projectRoot = args[0];
  const outputFile = args[1];

  // Step 1: File Discovery
  let files = [];
  try {
    // Try git ls-files first
    const gitOutput = execSync('git ls-files', { cwd: projectRoot, encoding: 'utf8' });
    files = gitOutput.trim().split('\n').filter(line => line.trim() !== '');
  } catch (e) {
    // Fallback to recursive listing with exclusions
    console.warn('git ls-files failed, falling back to recursive listing');
    const excludePatterns = [
      'node_modules', '.git', 'vendor', 'venv', '.venv', '__pycache__',
      'dist', 'build', 'out', 'coverage', '.next', '.cache', '.turbo', 'target',
      '.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
      '.mp3', '.mp4', '.pdf', '.zip', '.tar', '.gz',
      '.min.js', '.min.css', '.map', '.d.ts', '.generated.*',
      '.idea', '.vscode',
      '.md', '.txt', '.yml', '.yaml', '.toml', '.json', '.xml', '.lock', '.cfg', '.ini',
      'Makefile', 'Dockerfile',
      'LICENSE', '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc*', '.log'
    ];
    function shouldExclude(filePath) {
      return excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
          // Convert glob to regex
          const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
          const regex = new RegExp(regexStr);
          return regex.test(filePath);
        }
        return filePath.includes(pattern);
      });
    }
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(projectRoot, fullPath);
        if (entry.isDirectory()) {
          if (!shouldExclude(relPath)) {
            walk(fullPath);
          }
        } else {
          if (!shouldExclude(relPath)) {
            files.push(relPath);
          }
        }
      }
    }
    walk(projectRoot);
  }

  // Step 2: Language Detection
  const extToLang = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.rb': 'ruby',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.php': 'php',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.sh': 'bash',
    '.bash': 'bash'
  };
  const langSet = new Set();
  const fileLangMap = {};
  const sourceFiles = [];
  for (const file of files) {
    const ext = path.extname(file);
    const lang = extToLang[ext];
    if (lang) {
      langSet.add(lang);
      fileLangMap[file] = lang;
      sourceFiles.push(file);
    }
  }
  const languages = Array.from(langSet).sort();

  // Step 3: Line Counting
  const fileInfo = [];
  if (sourceFiles.length < 500) {
    for (const file of sourceFiles) {
      try {
        const output = execSync(`wc -l "${path.join(projectRoot, file)}"`, { encoding: 'utf8' });
        const lines = parseInt(output.trim().split(/\s+/)[0], 10);
        fileInfo.push({ path: file, language: fileLangMap[file], sizeLines: lines });
      } catch (e) {
        console.warn(`Failed to count lines for ${file}: ${e.message}`);
        fileInfo.push({ path: file, language: fileLangMap[file], sizeLines: 0 });
      }
    }
  } else {
    // Batch wc -l calls
    const batchSize = 100;
    for (let i = 0; i < sourceFiles.length; i += batchSize) {
      const batch = sourceFiles.slice(i, i + batchSize);
      const quoted = batch.map(f => `"${path.join(projectRoot, f)}"`).join(' ');
      try {
        const output = execSync(`wc -l ${quoted}`, { encoding: 'utf8' });
        const lines = output.trim().split('\n').map(line => parseInt(line.trim().split(/\s+/)[0], 10));
        for (let j = 0; j < batch.length; j++) {
          fileInfo.push({
            path: batch[j],
            language: fileLangMap[batch[j]],
            sizeLines: isNaN(lines[j]) ? 0 : lines[j]
          });
        }
      } catch (e) {
        console.warn(`Failed to count lines for batch: ${e.message}`);
        for (const file of batch) {
          fileInfo.push({ path: file, language: fileLangMap[file], sizeLines: 0 });
        }
      }
    }
  }

  // Step 4: Framework Detection
  const frameworks = [];
  // package.json
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const { name, description, dependencies = {}, devDependencies = {} } = pkg;
      const allDeps = { ...dependencies, ...devDependencies };
      const knownFrameworks = [
        'react', 'vue', 'svelte', '@angular/core', 'express', 'fastify', 'koa',
        'next', 'nuxt', 'vite', 'vitest', 'jest', 'mocha', 'tailwindcss',
        'prisma', 'typeorm', 'sequelize', 'mongoose', 'redux', 'zustand', 'mobx'
      ];
      for (const dep in allDeps) {
        if (knownFrameworks.includes(dep)) {
          // Map to display name
          let displayName = dep;
          if (dep === '@angular/core') displayName = 'Angular';
          if (dep === 'tailwindcss') displayName = 'Tailwind CSS';
          if (!frameworks.includes(displayName)) frameworks.push(displayName);
        }
      }
      // Also check for Next.js via next in dependencies
      if (dependencies.next || devDependencies.next) {
        if (!frameworks.includes('Next.js')) frameworks.push('Next.js');
      }
    } catch (e) {
      console.warn('Failed to parse package.json: ' + e.message);
    }
  }
  // tsconfig.json
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    // Already detected TypeScript via extension, but we can add if not present
    if (!frameworks.includes('TypeScript')) {
      // TypeScript is a language, not a framework per se, but we can note it
      // We'll not add to frameworks as it's already in languages.
    }
  }
  // Other config files can be added similarly, but we'll keep it simple for now.

  // Step 5: Complexity Estimation
  const totalFiles = fileInfo.length;
  let estimatedComplexity;
  if (totalFiles >= 1 && totalFiles <= 20) estimatedComplexity = 'small';
  else if (totalFiles <= 100) estimatedComplexity = 'moderate';
  else if (totalFiles <= 500) estimatedComplexity = 'large';
  else estimatedComplexity = 'very-large';

  // Step 6: Project Name
  let projectName = '';
  // 1. package.json name
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.name) projectName = pkg.name;
    } catch (e) {}
  }
  // 2. Cargo.toml
  if (!projectName) {
    const cargoPath = path.join(projectRoot, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf8');
        const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
        if (match) projectName = match[1];
      } catch (e) {}
    }
  }
  // 3. go.mod
  if (!projectName) {
    const goModPath = path.join(projectRoot, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = fs.readFileSync(goModPath, 'utf8');
        const match = content.match(/^\s*module\s+(.+)/m);
        if (match) {
          const module = match[1].trim();
          const segments = module.split('/');
          projectName = segments[segments.length - 1];
        }
      } catch (e) {}
    }
  }
  // 4. Directory name
  if (!projectName) {
    projectName = path.basename(projectRoot);
  }

  // Read rawDescription from package.json
  let rawDescription = '';
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      rawDescription = pkg.description || '';
    } catch (e) {}
  }

  // Read readmeHead (first 10 lines of README.md)
  let readmeHead = '';
  const readmePaths = ['README.md', 'README.rst', 'readme.md'];
  for (const readme of readmePaths) {
    const readmePath = path.join(projectRoot, readme);
    if (fs.existsSync(readmePath)) {
      try {
        const content = fs.readFileSync(readmePath, 'utf8');
        const lines = content.split('\n').slice(0, 10).join('\n');
        readmeHead = lines;
        break;
      } catch (e) {}
    }
  }

  // Build intermediate result
  const result = {
    scriptCompleted: true,
    name: projectName,
    rawDescription: rawDescription,
    readmeHead: readmeHead,
    languages: languages,
    frameworks: frameworks,
    files: fileInfo,
    totalFiles: totalFiles,
    estimatedComplexity: estimatedComplexity
  };

  // Write to output file
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`Scan completed. Results written to ${outputFile}`);
}

try {
  main();
} catch (e) {
  logError(`Unexpected error: ${e.message}`);
}