import fs from "fs";
import yaml from "js-yaml";
import mockFs from "mock-fs";
import path from "path";
import uuid from "uuid/v4";
import { readYaml, write } from "../../config";
import * as config from "../../config";
import {
  create as createBedrockYaml,
  isExists as isBedrockFileExists,
  read as readBedrockFile,
} from "../../lib/bedrockYaml";
import * as commandBuilder from "../../lib/commandBuilder";
import {
  PROJECT_PIPELINE_FILENAME,
  VERSION_MESSAGE,
} from "../../lib/constants";
import { AzureDevOpsOpts } from "../../lib/git";
import { createTempDir } from "../../lib/ioUtil";
import * as pipelineVariableGroup from "../../lib/pipelines/variableGroup";
import {
  disableVerboseLogging,
  enableVerboseLogging,
  logger,
} from "../../logger";
import {
  createTestBedrockYaml,
  createTestHldLifecyclePipelineYaml,
} from "../../test/mockFactory";
import { AzurePipelinesYaml, BedrockFile } from "../../types";
import {
  create,
  execute,
  setVariableGroupInBedrockFile,
  updateLifeCyclePipeline,
  validateValues,
} from "./create-variable-group";
import * as createVariableGrp from "./create-variable-group";
import * as fileutils from "../../lib/fileutils";

beforeAll(() => {
  enableVerboseLogging();
});

afterAll(() => {
  disableVerboseLogging();
});

beforeEach(() => {
  jest.clearAllMocks();
});

jest
  .spyOn(fileutils, "getVersionMessage")
  .mockReturnValue(VERSION_MESSAGE + "0.5");

const registryName = uuid();
const variableGroupName = uuid();
const hldRepoUrl = uuid();
const servicePrincipalId = uuid();
const servicePrincipalPassword: string = uuid();
const tenant = uuid();
const orgName = "orgName";
const devopsProject = "projectName";
const personalAccessToken = uuid();

describe("test execute function", () => {
  it("positive test", async () => {
    const exitFn = jest.fn();
    jest.spyOn(createVariableGrp, "checkDependencies").mockReturnValueOnce();
    jest.spyOn(config, "Config").mockReturnValueOnce({});
    jest
      .spyOn(commandBuilder, "validateForRequiredValues")
      .mockReturnValueOnce([]);
    jest.spyOn(createVariableGrp, "create").mockResolvedValueOnce({
      name: "groupName",
    });
    jest
      .spyOn(createVariableGrp, "setVariableGroupInBedrockFile")
      .mockReturnValueOnce();
    jest
      .spyOn(createVariableGrp, "updateLifeCyclePipeline")
      .mockReturnValueOnce();

    await execute(
      "groupName",
      {
        devopsProject,
        hldRepoUrl,
        orgName,
        personalAccessToken,
        registryName,
        servicePrincipalId,
        servicePrincipalPassword,
        tenant,
      },
      exitFn
    );
    expect(exitFn).toBeCalledTimes(1);
    expect(exitFn.mock.calls).toEqual([[0]]);
  });
  it("missing variable name", async () => {
    const exitFn = jest.fn();
    await execute(
      "",
      {
        devopsProject,
        hldRepoUrl,
        orgName,
        personalAccessToken,
        registryName,
        servicePrincipalId,
        servicePrincipalPassword,
        tenant,
      },
      exitFn
    );
    expect(exitFn).toBeCalledTimes(1);
    expect(exitFn.mock.calls).toEqual([[1]]);
  });
  it("missing registry name", async () => {
    const exitFn = jest.fn();
    await execute(
      variableGroupName,
      {
        devopsProject,
        hldRepoUrl,
        orgName,
        personalAccessToken,
        registryName: undefined,
        servicePrincipalId,
        servicePrincipalPassword,
        tenant,
      },
      exitFn
    );
    expect(exitFn).toBeCalledTimes(1);
    expect(exitFn.mock.calls).toEqual([[1]]);
  });
});

describe("create", () => {
  it("Should fail with empty variable group arguments", async () => {
    const accessOpts: AzureDevOpsOpts = {
      orgName,
      personalAccessToken,
      project: devopsProject,
    };

    // for some reasons, cannot get the await expect(...).rejects.toThrow() to work
    try {
      await create("", "", "", "", "", "", accessOpts);
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.message).toBe("Required values were missing");
    }
  });

  test("Should pass with variable group arguments", async () => {
    // mock the function that calls the Azdo project's Task API
    // because unit test is unable to reach this API.
    // all the validation of parameters passed into create
    // function succeeds
    const doAddVariableGroupMock = jest.spyOn(
      pipelineVariableGroup,
      "doAddVariableGroup"
    );
    doAddVariableGroupMock.mockImplementation(() => {
      return Promise.resolve({});
    });

    const accessOpts: AzureDevOpsOpts = {
      orgName,
      personalAccessToken,
      project: devopsProject,
    };

    try {
      logger.info("calling create");
      await create(
        variableGroupName,
        registryName,
        hldRepoUrl,
        servicePrincipalId,
        servicePrincipalPassword,
        tenant,
        accessOpts
      );
    } catch (err) {
      // should not reach here
      expect(true).toBe(false);
    }
  });
});

describe("setVariableGroupInBedrockFile", () => {
  test("Should fail with empty arguments", async () => {
    let invalidGroupNameError: Error | undefined;
    try {
      logger.info("calling create");
      await setVariableGroupInBedrockFile("", "");
    } catch (err) {
      invalidGroupNameError = err;
    }
    expect(invalidGroupNameError).toBeDefined();
  });

  test("Should fail with empty variable group name", async () => {
    let invalidGroupNameError: Error | undefined;
    try {
      logger.info("calling create");
      await setVariableGroupInBedrockFile(uuid(), "");
    } catch (err) {
      invalidGroupNameError = err;
    }
    expect(invalidGroupNameError).toBeDefined();
  });

  test("Should fail with empty directory", async () => {
    let invalidGroupNameError: Error | undefined;
    try {
      logger.info("calling create");
      await setVariableGroupInBedrockFile("", uuid());
    } catch (err) {
      invalidGroupNameError = err;
    }
    expect(invalidGroupNameError).toBeDefined();
  });

  test("Should fail adding a variable group name when no bedrock file exists", async () => {
    // Create random directory to initialize
    const randomTmpDir = createTempDir();
    let noFileError: Error | undefined;

    try {
      await setVariableGroupInBedrockFile(randomTmpDir, variableGroupName);
    } catch (err) {
      logger.info(`${err}`);
      noFileError = err;
    }
    expect(noFileError).toBeDefined();
  });

  test("Should pass adding a valid variable group name when bedrock file exists with empty variableGroups", async () => {
    // Create random directory to initialize
    const randomTmpDir = createBedrockYaml();

    await setVariableGroupInBedrockFile(randomTmpDir, variableGroupName);

    expect(isBedrockFileExists(randomTmpDir)).toBe(true);
    const bedrockFile = readBedrockFile(randomTmpDir);

    logger.info(`filejson: ${JSON.stringify(bedrockFile)}`);
    expect(bedrockFile.variableGroups).toBeDefined();
    if (bedrockFile.variableGroups) {
      expect(bedrockFile.variableGroups[0]).toBe(variableGroupName);
    }
  });

  test("Should pass adding a valid variable group name when bedrock file exists when variableGroups length is > 0", async () => {
    // Create random directory to initialize

    const prevariableGroupName = uuid();
    logger.info(`prevariableGroupName: ${prevariableGroupName}`);
    const bedrockFileData: BedrockFile = {
      rings: {}, // rings is optional but necessary to create a bedrock file in config.write method
      services: {}, // service property is not optional so set it to null
      variableGroups: [prevariableGroupName],
      version: "",
    };

    const randomTmpDir = createBedrockYaml("", bedrockFileData);
    await setVariableGroupInBedrockFile(randomTmpDir, variableGroupName);
    expect(isBedrockFileExists(randomTmpDir)).toBe(true);

    const bedrockFile = readBedrockFile(randomTmpDir);
    logger.info(`filejson: ${JSON.stringify(bedrockFile)}`);
    expect(bedrockFile.variableGroups).toBeDefined();
    if (bedrockFile.variableGroups) {
      expect(bedrockFile.variableGroups[0]).toBe(prevariableGroupName);
      expect(bedrockFile.variableGroups[1]).toBe(variableGroupName);
    }
  });
});

describe("updateLifeCyclePipeline", () => {
  beforeAll(() => {
    mockFs({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "bedrock.yaml": createTestBedrockYaml() as any,
    });
  });

  afterAll(() => {
    mockFs.restore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("Should fail with empty arguments", async () => {
    let invalidDirError: Error | undefined;
    try {
      await updateLifeCyclePipeline("");
    } catch (err) {
      invalidDirError = err;
    }
    expect(invalidDirError).toBeDefined();
  });

  test("Should fail adding a variable group name when no pipeline yaml file exists", async () => {
    // Create random directory to initialize
    const randomTmpDir = createTempDir();
    let noFileError: Error | undefined;

    try {
      await updateLifeCyclePipeline(randomTmpDir);
    } catch (err) {
      noFileError = err;
    }
    expect(noFileError).toBeDefined();
  });

  test("Should pass adding variable groups when bedrock file exists with empty variableGroups", async () => {
    // Create random directory to initialize
    const randomTmpDir = createTempDir();

    const defaultBedrockFileObject = createTestBedrockYaml(
      false
    ) as BedrockFile;

    write(defaultBedrockFileObject, randomTmpDir);

    const hldFilePath = path.join(randomTmpDir, PROJECT_PIPELINE_FILENAME);

    const hldLifeCycleFile: AzurePipelinesYaml = createTestHldLifecyclePipelineYaml(
      false
    ) as AzurePipelinesYaml;

    const asYaml = yaml.safeDump(hldLifeCycleFile, {
      lineWidth: Number.MAX_SAFE_INTEGER,
    });

    fs.writeFileSync(hldFilePath, asYaml);

    await updateLifeCyclePipeline(randomTmpDir);

    const hldLifeCycleYaml = readYaml<AzurePipelinesYaml>(hldFilePath);
    logger.info(`filejson: ${JSON.stringify(hldLifeCycleYaml)}`);
    expect(hldLifeCycleYaml.variables).toBeDefined();
    if (hldLifeCycleYaml.variables) {
      expect(hldLifeCycleYaml.variables.length).toBeLessThanOrEqual(0);
    }
  });

  test("Should pass adding variable groups when bedrock file exists with one variableGroup", async () => {
    // Create random directory to initialize
    const randomTmpDir = createTempDir();
    logger.info(`random dir: ${randomTmpDir})`);

    const defaultBedrockFileObject = createTestBedrockYaml(
      false
    ) as BedrockFile;

    // add new variabe group
    defaultBedrockFileObject.variableGroups = [
      ...(defaultBedrockFileObject.variableGroups ?? []),
      variableGroupName,
    ];

    write(defaultBedrockFileObject, randomTmpDir);

    const hldFilePath = path.join(randomTmpDir, PROJECT_PIPELINE_FILENAME);

    const hldLifeCycleFile: AzurePipelinesYaml = createTestHldLifecyclePipelineYaml(
      false
    ) as AzurePipelinesYaml;

    const asYaml = yaml.safeDump(hldLifeCycleFile, {
      lineWidth: Number.MAX_SAFE_INTEGER,
    });

    fs.writeFileSync(hldFilePath, asYaml);

    updateLifeCyclePipeline(randomTmpDir);

    const hldLifeCycleYaml = readYaml<AzurePipelinesYaml>(hldFilePath);
    logger.info(`filejson: ${JSON.stringify(hldLifeCycleYaml)}`);
    expect(hldLifeCycleYaml.variables).toBeDefined();

    if (hldLifeCycleYaml.variables) {
      expect(hldLifeCycleYaml.variables[0]).toEqual({
        group: variableGroupName,
      });
    }
  });
});

describe("test validateValues function", () => {
  it("valid org and project name", () => {
    validateValues(devopsProject, orgName);
  });
  it("invalid project name", () => {
    expect(() => {
      validateValues("project\\abc", orgName);
    }).toThrow();
  });
  it("invalid org name", () => {
    expect(() => {
      validateValues(devopsProject, "org name");
    }).toThrow();
  });
});
