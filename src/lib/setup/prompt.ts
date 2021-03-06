import fs from "fs";
import inquirer from "inquirer";
import * as promptBuilder from "../promptBuilder";
import {
  validateAccessToken,
  validateACRName,
  validateOrgName,
  validateProjectName,
  validateServicePrincipalId,
  validateServicePrincipalPassword,
  validateServicePrincipalTenantId,
  validateSubscriptionId,
  validateStorageAccountName,
  validateStorageTableName,
} from "../validator";
import {
  ACR_NAME,
  DEFAULT_PROJECT_NAME,
  HLD_REPO,
  RequestContext,
  WORKSPACE,
} from "./constants";
import { getAzureRepoUrl } from "./gitService";
import {
  azCLILogin,
  createWithAzCLI,
  SubscriptionData,
} from "../azure/servicePrincipalService";
import {
  getSubscriptions,
  SubscriptionItem,
} from "../azure/subscriptionService";

export const promptForSubscriptionId = async (
  subscriptions: SubscriptionItem[] | SubscriptionData[]
): Promise<string | undefined> => {
  const questions = [
    {
      choices: subscriptions.map((s) => s.name),
      message: "Select one of the subscriptions\n",
      name: "az_subscription",
      type: "list",
    },
  ];
  const ans = await inquirer.prompt(questions);
  const found = subscriptions.find(
    (s) => s.name === (ans.az_subscription as string)
  );
  return found ? found.id : undefined;
};

export const getSubscriptionId = async (rc: RequestContext): Promise<void> => {
  const subscriptions = await getSubscriptions(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    rc.servicePrincipalId!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    rc.servicePrincipalPassword!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    rc.servicePrincipalTenantId!
  );
  if (subscriptions.length === 0) {
    throw Error("no subscriptions found");
  }
  if (subscriptions.length === 1) {
    rc.subscriptionId = subscriptions[0].id;
  } else {
    const subId = await promptForSubscriptionId(subscriptions);
    if (!subId) {
      throw Error("Subscription Identifier is missing.");
    }
    rc.subscriptionId = subId;
  }
};

/**
 * Prompts for service principal identifer, password and tenant identifer.
 * Request context will have the service principal information
 * when this function is completed successfully.
 *
 * @param rc Request Context
 */
export const promptForServicePrincipal = async (
  rc: RequestContext
): Promise<void> => {
  const answers = await inquirer.prompt(promptBuilder.servicePrincipal());
  rc.servicePrincipalId = answers.az_sp_id;
  rc.servicePrincipalPassword = answers.az_sp_password;
  rc.servicePrincipalTenantId = answers.az_sp_tenant;
};

/**
 * Prompts for ACR name, default value is "quickStartACR".
 * This is needed bacause ACR name has to be unique within Azure.
 *
 * @param rc Request Context
 */
export const promptForACRName = async (rc: RequestContext): Promise<void> => {
  const questions = [
    {
      default: ACR_NAME,
      message: `Enter Azure Container Register Name. The registry name must be unique within Azure\n`,
      name: "acr_name",
      type: "input",
      validate: validateACRName,
    },
  ];
  const answers = await inquirer.prompt(questions);
  rc.acrName = answers.acr_name as string;
};

/**
 * Prompts for creating service principal. User can choose
 * Yes or No.
 *
 * @param rc Request Context
 */
export const promptForServicePrincipalCreation = async (
  rc: RequestContext
): Promise<void> => {
  const questions = [promptBuilder.askToCreateServicePrincipal(true)];
  const answers = await inquirer.prompt(questions);
  if (answers.create_service_principal) {
    rc.toCreateSP = true;
    const subscriptions = await azCLILogin();
    const subscriptionId = await promptForSubscriptionId(subscriptions);
    if (!subscriptionId) {
      throw Error("Subscription Identifier is missing.");
    }
    rc.subscriptionId = subscriptionId;
    const sp = await createWithAzCLI(rc.subscriptionId);
    rc.createServicePrincipal = true;
    rc.servicePrincipalId = sp.id;
    rc.servicePrincipalPassword = sp.password;
    rc.servicePrincipalTenantId = sp.tenantId;
  } else {
    rc.toCreateSP = false;
    await promptForServicePrincipal(rc);
    await getSubscriptionId(rc);
  }
};

/**
 * Prompts for questions
 *
 * @return answers to the questions
 */
export const prompt = async (): Promise<RequestContext> => {
  const questions = [
    promptBuilder.azureOrgName(),
    promptBuilder.azureProjectName(),
    promptBuilder.azureAccessToken(),
    {
      default: true,
      message: "Would you like to create a sample application repository?",
      name: "create_app_repo",
      type: "confirm",
    },
  ];
  const answers = await inquirer.prompt(questions);
  const rc: RequestContext = {
    accessToken: answers.azdo_pat as string,
    orgName: answers.azdo_org_name as string,
    projectName: answers.azdo_project_name as string,
    toCreateAppRepo: answers.create_app_repo as boolean,
    workspace: WORKSPACE,
  };

  if (rc.toCreateAppRepo) {
    await promptForServicePrincipalCreation(rc);
    await promptForACRName(rc);
  }
  return rc;
};

export const validationServicePrincipalInfoFromFile = (
  rc: RequestContext,
  map: { [key: string]: string }
): void => {
  if (rc.toCreateAppRepo) {
    rc.toCreateSP = map.az_create_sp === "true";

    // file needs to contain sp information if user
    // choose not to create SP
    if (!rc.toCreateSP) {
      const vSPId = validateServicePrincipalId(map.az_sp_id);
      if (typeof vSPId === "string") {
        throw new Error(vSPId);
      }
      const vSPPassword = validateServicePrincipalPassword(map.az_sp_password);
      if (typeof vSPPassword === "string") {
        throw new Error(vSPPassword);
      }
      const vSPTenantId = validateServicePrincipalTenantId(map.az_sp_tenant);
      if (typeof vSPTenantId === "string") {
        throw new Error(vSPTenantId);
      }
    }

    const vSubscriptionId = validateSubscriptionId(map.az_subscription_id);
    if (typeof vSubscriptionId === "string") {
      throw new Error(vSubscriptionId);
    }
    rc.subscriptionId = map.az_subscription_id;
  }
};

const parseInformationFromFile = (file: string): { [key: string]: string } => {
  let content = "";
  try {
    content = fs.readFileSync(file, "utf-8");
  } catch (_) {
    throw new Error(
      `${file} did not exist or not accessible. Make sure that it is accessible.`
    );
  }

  const arr = content.split("\n").filter((s) => s.trim().length > 0);
  const map: { [key: string]: string } = {};
  arr.forEach((s) => {
    const idx = s.indexOf("=");
    if (idx !== -1) {
      map[s.substring(0, idx).trim()] = s.substring(idx + 1).trim();
    }
  });
  return map;
};

/**
 * Returns answers that are provided in a file.
 *
 * @param file file name
 */
export const getAnswerFromFile = (file: string): RequestContext => {
  const map = parseInformationFromFile(file);
  map["azdo_project_name"] = map.azdo_project_name || DEFAULT_PROJECT_NAME;

  const vOrgName = validateOrgName(map.azdo_org_name);
  if (typeof vOrgName === "string") {
    throw new Error(vOrgName);
  }

  const vProjectName = validateProjectName(map.azdo_project_name);
  if (typeof vProjectName === "string") {
    throw new Error(vProjectName);
  }

  const vToken = validateAccessToken(map.azdo_pat);
  if (typeof vToken === "string") {
    throw new Error(vToken);
  }

  const vStorageAccountName = validateStorageAccountName(
    map.az_storage_account_name
  );
  if (typeof vStorageAccountName === "string") {
    throw new Error(vStorageAccountName);
  }

  const vStorageTable = validateStorageTableName(map.az_storage_table);
  if (typeof vStorageTable === "string") {
    throw new Error(vStorageTable);
  }

  const rc: RequestContext = {
    accessToken: map.azdo_pat,
    orgName: map.azdo_org_name,
    projectName: map.azdo_project_name,
    servicePrincipalId: map.az_sp_id,
    servicePrincipalPassword: map.az_sp_password,
    servicePrincipalTenantId: map.az_sp_tenant,
    acrName: map.az_acr_name || ACR_NAME,
    storageAccountName: map.az_storage_account_name,
    storageTableName: map.az_storage_table,
    workspace: WORKSPACE,
  };

  rc.toCreateAppRepo = map.az_create_app === "true";
  validationServicePrincipalInfoFromFile(rc, map);

  return rc;
};

export const promptForApprovingHLDPullRequest = async (
  rc: RequestContext
): Promise<boolean> => {
  const urlPR = `${getAzureRepoUrl(
    rc.orgName,
    rc.projectName,
    HLD_REPO
  )}/pullrequest`;
  const answers = await inquirer.prompt([
    promptBuilder.approvingHLDPullRequest(urlPR),
  ]);
  return !!answers.approve_hld_pr;
};
