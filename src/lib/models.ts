// azure-openai    → AzureOpenAI SDK  (GPT models via Azure AI Services /openai/...)
// azure-anthropic → Anthropic SDK    (Claude models via Azure AI Services /anthropic/...)
// azure-foundry   → OpenAI SDK       (other OpenAI-compatible Foundry deployments)
export type Provider = 'azure-openai' | 'azure-anthropic' | 'azure-foundry'

export interface ModelConfig {
  id: string
  name: string
  description: string
  provider: Provider
  deploymentName: string
  endpointEnv: string
  apiKeyEnv: string
  badge: string
  color: string
  reasoningEffort?: string   // set for reasoning models (e.g. 'medium')
  useResponsesAPI?: boolean  // GPT-5 gen models use /responses instead of /chat/completions
  noPpt?: boolean            // hide PPT button (model not suited for pptxgenjs generation)
}

export const MODELS: ModelConfig[] = [
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    description: 'OpenAI · Fast & efficient',
    provider: 'azure-foundry',
    deploymentName: 'gpt-5.4-mini',
    endpointEnv: 'AZURE_OPENAI_PROJECT_ENDPOINT',
    apiKeyEnv: 'AZURE_AI_API_KEY',
    badge: 'GPT',
    color: '#60a5fa',
  },
  {
    id: 'gpt-5-3-codex',
    name: 'GPT-5.3 Codex',
    description: 'OpenAI · Coding',
    provider: 'azure-foundry',
    deploymentName: 'gpt-5.3-codex',
    endpointEnv: 'AZURE_OPENAI_PROJECT_ENDPOINT',
    apiKeyEnv: 'AZURE_AI_API_KEY',
    badge: 'GPT',
    color: '#818cf8',
    reasoningEffort: 'medium',
    useResponsesAPI: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'Anthropic · Latest',
    provider: 'azure-anthropic',
    deploymentName: 'claude-sonnet-4-6',
    endpointEnv: 'AZURE_AI_ENDPOINT',
    apiKeyEnv: 'AZURE_AI_API_KEY',
    badge: 'Claude',
    color: '#fb923c',
  },
  {
    id: 'deepseek-v3-2',
    name: 'DeepSeek V3.2',
    description: 'DeepSeek · Latest',
    provider: 'azure-foundry',
    deploymentName: 'DeepSeek-V3.2',
    endpointEnv: 'AZURE_AI_ENDPOINT',
    apiKeyEnv: 'AZURE_AI_API_KEY',
    badge: 'DS',
    color: '#34d399',
    noPpt: true,
  },
]
