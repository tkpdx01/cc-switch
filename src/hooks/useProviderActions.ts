import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { providersApi, settingsApi, type AppId } from "@/lib/api";
import type { Provider, UsageScript } from "@/types";
import {
  useAddProviderMutation,
  useUpdateProviderMutation,
  useDeleteProviderMutation,
  useSwitchProviderMutation,
} from "@/lib/query";
import { extractErrorMessage } from "@/utils/errorUtils";

/**
 * Hook for managing provider actions (add, update, delete, switch)
 * Extracts business logic from App.tsx
 */
export function useProviderActions(activeApp: AppId) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const addProviderMutation = useAddProviderMutation(activeApp);
  const updateProviderMutation = useUpdateProviderMutation(activeApp);
  const deleteProviderMutation = useDeleteProviderMutation(activeApp);
  const switchProviderMutation = useSwitchProviderMutation(activeApp);

  // Claude 插件同步逻辑
  const syncClaudePlugin = useCallback(
    async (provider: Provider) => {
      if (activeApp !== "claude") return;

      try {
        const settings = await settingsApi.get();
        if (!settings?.enableClaudePluginIntegration) {
          return;
        }

        const isOfficial = provider.category === "official";
        await settingsApi.applyClaudePluginConfig({ official: isOfficial });

        // 静默执行，不显示成功通知
      } catch (error) {
        const detail =
          extractErrorMessage(error) ||
          t("notifications.syncClaudePluginFailed", {
            defaultValue: "同步 Claude 插件失败",
          });
        toast.error(detail, { duration: 4200 });
      }
    },
    [activeApp, t],
  );

  // 添加供应商
  const addProvider = useCallback(
    async (provider: Omit<Provider, "id">) => {
      await addProviderMutation.mutateAsync(provider);
    },
    [addProviderMutation],
  );

  // 更新供应商
  const updateProvider = useCallback(
    async (provider: Provider) => {
      await updateProviderMutation.mutateAsync(provider);

      // 更新托盘菜单（失败不影响主操作）
      try {
        await providersApi.updateTrayMenu();
      } catch (trayError) {
        console.error(
          "Failed to update tray menu after updating provider",
          trayError,
        );
      }
    },
    [updateProviderMutation],
  );

  // 切换供应商
  const switchProvider = useCallback(
    async (provider: Provider) => {
      try {
        await switchProviderMutation.mutateAsync(provider.id);
        await syncClaudePlugin(provider);
      } catch {
        // 错误提示由 mutation 与同步函数处理
      }
    },
    [switchProviderMutation, syncClaudePlugin],
  );

  // 删除供应商
  const deleteProvider = useCallback(
    async (id: string) => {
      await deleteProviderMutation.mutateAsync(id);
    },
    [deleteProviderMutation],
  );

  // 保存用量脚本
  const saveUsageScript = useCallback(
    async (provider: Provider, script: UsageScript) => {
      try {
        const updatedProvider: Provider = {
          ...provider,
          meta: {
            ...provider.meta,
            usage_script: script,
          },
        };

        await providersApi.update(updatedProvider, activeApp);
        await queryClient.invalidateQueries({
          queryKey: ["providers", activeApp],
        });
        toast.success(
          t("provider.usageSaved", {
            defaultValue: "用量查询配置已保存",
          }),
          { closeButton: true },
        );
      } catch (error) {
        const detail =
          extractErrorMessage(error) ||
          t("provider.usageSaveFailed", {
            defaultValue: "用量查询配置保存失败",
          });
        toast.error(detail);
      }
    },
    [activeApp, queryClient, t],
  );

  // 复制 Claude 预设命令到剪贴板
  const copyClaudeCommand = useCallback(
    async (provider: Provider) => {
      if (activeApp !== "claude") {
        toast.error(
          t("provider.onlyForClaude", {
            defaultValue: "此功能仅适用于 Claude",
          }),
        );
        return;
      }

      try {
        const command = await providersApi.getClaudePresetCommand(
          provider.id,
          activeApp,
        );
        await navigator.clipboard.writeText(command);
        toast.success(
          t("provider.commandCopied", {
            defaultValue: "命令已复制到剪贴板",
          }),
          { closeButton: true },
        );
      } catch (error) {
        const detail =
          extractErrorMessage(error) ||
          t("provider.copyCommandFailed", {
            defaultValue: "复制命令失败",
          });
        toast.error(detail);
      }
    },
    [activeApp, t],
  );

  // 生成 Claude 预设脚本
  const generateClaudeScript = useCallback(
    async (provider: Provider) => {
      if (activeApp !== "claude") {
        toast.error(
          t("provider.onlyForClaude", {
            defaultValue: "此功能仅适用于 Claude",
          }),
        );
        return;
      }

      try {
        const scriptPath = await providersApi.generateClaudePresetScript(
          provider.id,
          activeApp,
        );
        toast.success(
          t("provider.scriptGenerated", {
            defaultValue: "脚本已生成: {{path}}",
            path: scriptPath,
          }),
          { closeButton: true, duration: 5000 },
        );
      } catch (error) {
        const detail =
          extractErrorMessage(error) ||
          t("provider.generateScriptFailed", {
            defaultValue: "生成脚本失败",
          });
        toast.error(detail);
      }
    },
    [activeApp, t],
  );

  return {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    saveUsageScript,
    copyClaudeCommand,
    generateClaudeScript,
    isLoading:
      addProviderMutation.isPending ||
      updateProviderMutation.isPending ||
      deleteProviderMutation.isPending ||
      switchProviderMutation.isPending,
  };
}
