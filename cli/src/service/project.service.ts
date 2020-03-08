import { exec } from 'child_process';
import fs from 'fs-extra';
import { inject as Inject, injectable as Injectable } from 'inversify';
import { Clone as git } from 'nodegit';
import { Package } from '../model/package';
import { LogService } from './log.service';
import { SpinnerService } from './spinner.service';
import { Feature } from '../model/feature';

const deleteFiles = ['README.md'];
const deleteDirs = ['.git', 'cli'];

const jsonFormat = { spaces: 2 };
const getProjectDir = (name: string) => `${process.cwd()}/${name}`;

const projectNameMatch = new RegExp(/^[a-z0-9-_]+$/);
const invalidProjectName = (name: string) => !projectNameMatch.test(String(name));

@Injectable()
export class ProjectService {
  constructor(
    @Inject('LogService') private readonly log: LogService,
    @Inject('SpinnerService') private readonly spinner: SpinnerService,
    @Inject('Package') private readonly pkg: Package
  ) {}

  /**
   * Clone https://github.com/larscom/angular-chrome-extension
   * and clean up specific files and folders
   */
  async generate(projectName: string, features: Feature[]): Promise<void> {
    const cloneDir = getProjectDir(projectName);
    const { repository } = this.pkg;

    try {
      this.spinner.start('creating extension...');

      await git.clone(repository.url, cloneDir);
      await this.cleanDir(cloneDir);
      await this.writePackageJson(cloneDir, projectName);
      await this.writeManifestJson(cloneDir, projectName, features);

      this.spinner.stop(`done! created extension in: ${cloneDir}`);
    } catch (e) {
      this.log.error(e);
      this.spinner.stop();
    }
  }

  /**
   * Install the required dependencies using `npm ci`
   */
  async install(projectName: string): Promise<void> {
    const cloneDir = getProjectDir(projectName);
    process.chdir(cloneDir);

    try {
      this.spinner.start('installing dependencies...');

      await this.execAsync('npm ci');

      this.spinner.stop('done! installed dependencies');
    } catch (e) {
      this.log.error(e);
      this.spinner.stop();
    }
  }

  async validateName(projectName: string): Promise<void> {
    if (invalidProjectName(projectName)) {
      this.log.error(`Invalid project name, must match: ${projectNameMatch.toString()}`);
      process.exit(1);
    }
    const projectExists = await this.existsAsync(projectName);
    if (projectExists) {
      this.log.error(`Project '${projectName}' already exists`);
      process.exit(1);
    }
  }

  validateFeatures(features: Feature[]): void {
    if (!features.length) {
      this.log.error('You must select at least 1 feature');
      process.exit(1);
    }
  }

  private async cleanDir(cloneDir: string): Promise<[Promise<void>[], Promise<void>[]]> {
    return Promise.all([
      deleteDirs.map(dir => fs.remove(`${cloneDir}/${dir}`)),
      deleteFiles.map(file => fs.unlink(`${cloneDir}/${file}`))
    ]);
  }

  private async writeManifestJson(cloneDir: string, projectName: string, features: Feature[]): Promise<void> {
    const manifestJson = `${cloneDir}/angular/src/manifest.json`;
    const currentManifest = require(manifestJson);

    const manifest = {
      name: projectName,
      short_name: projectName,
      description: `Generated with ${this.pkg.name}`,
      browser_action: features.includes(Feature.POPUP) ? currentManifest.browser_action : undefined,
      options_page: features.includes(Feature.OPTIONS) ? currentManifest.options_page : undefined,
      chrome_url_overrides: features.includes(Feature.TAB) ? currentManifest.chrome_url_overrides : undefined
    };

    return fs.writeJson(manifestJson, { ...currentManifest, ...manifest }, jsonFormat);
  }

  private async writePackageJson(cloneDir: string, projectName: string): Promise<void> {
    const packageJson = `${cloneDir}/package.json`;
    return fs.writeJson(
      packageJson,
      {
        ...require(packageJson),
        name: projectName,
        description: `Generated with ${this.pkg.name}`,
        author: undefined
      },
      jsonFormat
    );
  }

  private existsAsync(projectName: string): Promise<boolean> {
    return fs.pathExists(getProjectDir(projectName));
  }

  private execAsync(command: string): Promise<void> {
    return new Promise((resolve, reject) => exec(command, error => (error ? reject(error) : resolve())));
  }
}