import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  appNameFromPath,
  findAppNameByBundleId,
  findFirstPid,
  getProcessSample,
  getWindowCount,
  isProcessRunning,
  readBundleIdFromApp,
  runChecked,
  sleep,
} from "./desktop-utils.js"

type DesktopSoakDeps = {
  appNameFromPath: typeof appNameFromPath
  findAppNameByBundleId: typeof findAppNameByBundleId
  findFirstPid: typeof findFirstPid
  getProcessSample: typeof getProcessSample
  getWindowCount: typeof getWindowCount
  isProcessRunning: typeof isProcessRunning
  readBundleIdFromApp: typeof readBundleIdFromApp
  runChecked: typeof runChecked
  sleep: typeof sleep
}

const defaultDesktopSoakDeps: DesktopSoakDeps = {
  appNameFromPath,
  findAppNameByBundleId,
  findFirstPid,
  getProcessSample,
  getWindowCount,
  isProcessRunning,
  readBundleIdFromApp,
  runChecked,
  sleep,
}

export type DesktopSoakConfig = {
  targetType: string
  app?: string
  bundleId?: string
  durationSeconds: number
  intervalSeconds: number
  gates?: {
    rssGrowthMbMax?: number
    cpuAvgPercentMax?: number
    crashCountMax?: number
  }
}

export type DesktopSoakSample = {
  timestamp: string
  running: boolean
  rssMb?: number
  cpuPercent?: number
  windowCount?: number
}

type DesktopSoakWindowFluctuation = {
  observedSamples: number
  changeCount: number
  maxDelta: number
  avgDelta: number
}

type DesktopSoakStabilityMetrics = {
  crashRecoveryAttempts: number
  crashRecoveryFailedCount: number
  maxContinuousInactivityWindows: number
  maxContinuousInactivitySeconds: number
  windowFluctuation: DesktopSoakWindowFluctuation
}

export type DesktopSoakResult = {
  targetType: string
  status: "passed" | "blocked"
  reasonCode?: string
  durationSeconds: number
  intervalSeconds: number
  appName?: string
  crashCount: number
  rssGrowthMb?: number
  rssMaxMb?: number
  cpuAvgPercent?: number
  stabilityMetrics?: DesktopSoakStabilityMetrics
  samples: DesktopSoakSample[]
  reportPath: string
}

async function attemptRecovery(
  config: DesktopSoakConfig,
  appName: string | undefined,
  bundleId: string | undefined,
  deps: DesktopSoakDeps
): Promise<boolean> {
  let recovered = false
  if (config.targetType === "tauri" && config.app) {
    const launch = deps.runChecked("open", ["-a", config.app], 30000)
    if (launch.ok && bundleId) {
      deps.runChecked("osascript", ["-e", `tell application id "${bundleId}" to activate`], 30000)
    }
    recovered = launch.ok
  } else if (config.targetType === "swift" && config.bundleId) {
    const launch = deps.runChecked("open", ["-b", config.bundleId], 30000)
    if (launch.ok) {
      deps.runChecked(
        "osascript",
        ["-e", `tell application id "${config.bundleId}" to activate`],
        30000
      )
    }
    recovered = launch.ok
  }
  if (recovered) {
    await deps.sleep(700)
  }
  if (!recovered) {
    return false
  }
  if (!appName) {
    return true
  }
  return deps.isProcessRunning(appName)
}

function calculateWindowFluctuation(samples: DesktopSoakSample[]): DesktopSoakWindowFluctuation {
  const windows = samples
    .map((sample) => sample.windowCount)
    .filter((value): value is number => typeof value === "number")
  if (windows.length < 2) {
    return {
      observedSamples: windows.length,
      changeCount: 0,
      maxDelta: 0,
      avgDelta: 0,
    }
  }
  const deltas: number[] = []
  for (let i = 1; i < windows.length; i += 1) {
    deltas.push(Math.abs(windows[i] - windows[i - 1]))
  }
  const changeCount = deltas.filter((delta) => delta > 0).length
  return {
    observedSamples: windows.length,
    changeCount,
    maxDelta: Math.max(...deltas),
    avgDelta: Number((deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length).toFixed(2)),
  }
}

export async function runDesktopSoak(
  baseDir: string,
  config: DesktopSoakConfig,
  deps: DesktopSoakDeps = defaultDesktopSoakDeps
): Promise<DesktopSoakResult> {
  const reportPath = "metrics/desktop-soak.json"
  const samples: DesktopSoakSample[] = []
  let crashCount = 0
  let crashRecoveryAttempts = 0
  let crashRecoveryFailedCount = 0
  let currentInactivityWindows = 0
  let maxContinuousInactivityWindows = 0
  let appName: string | undefined
  let bundleId: string | undefined

  if (config.targetType === "tauri") {
    if (!config.app) {
      const blocked: DesktopSoakResult = {
        targetType: config.targetType,
        status: "blocked",
        reasonCode: "desktop.tauri.app.missing",
        durationSeconds: config.durationSeconds,
        intervalSeconds: config.intervalSeconds,
        crashCount: 1,
        samples,
        reportPath,
      }
      writeFileSync(resolve(baseDir, reportPath), JSON.stringify(blocked, null, 2), "utf8")
      return blocked
    }
    appName = deps.appNameFromPath(config.app)
    bundleId = deps.readBundleIdFromApp(config.app)
  } else if (config.targetType === "swift") {
    if (!config.bundleId) {
      const blocked: DesktopSoakResult = {
        targetType: config.targetType,
        status: "blocked",
        reasonCode: "desktop.swift.bundle.missing",
        durationSeconds: config.durationSeconds,
        intervalSeconds: config.intervalSeconds,
        crashCount: 1,
        samples,
        reportPath,
      }
      writeFileSync(resolve(baseDir, reportPath), JSON.stringify(blocked, null, 2), "utf8")
      return blocked
    }
    bundleId = config.bundleId
    appName = deps.findAppNameByBundleId(bundleId)
  } else {
    const blocked: DesktopSoakResult = {
      targetType: config.targetType,
      status: "blocked",
      reasonCode: "desktop.target.unsupported",
      durationSeconds: config.durationSeconds,
      intervalSeconds: config.intervalSeconds,
      crashCount: 1,
      samples,
      reportPath,
    }
    writeFileSync(resolve(baseDir, reportPath), JSON.stringify(blocked, null, 2), "utf8")
    return blocked
  }

  const launch =
    config.targetType === "tauri" && config.app
      ? deps.runChecked("open", ["-a", config.app], 30000)
      : deps.runChecked("open", ["-b", bundleId ?? ""], 30000)
  if (!launch.ok) {
    const blocked: DesktopSoakResult = {
      targetType: config.targetType,
      status: "blocked",
      reasonCode: "desktop.soak.launch_failed",
      durationSeconds: config.durationSeconds,
      intervalSeconds: config.intervalSeconds,
      appName,
      crashCount: 1,
      samples,
      reportPath,
    }
    writeFileSync(resolve(baseDir, reportPath), JSON.stringify(blocked, null, 2), "utf8")
    return blocked
  }

  if (bundleId) {
    deps.runChecked("osascript", ["-e", `tell application id "${bundleId}" to activate`], 30000)
  }

  await deps.sleep(1800)
  const loops = Math.max(1, Math.ceil(config.durationSeconds / Math.max(1, config.intervalSeconds)))

  for (let i = 0; i < loops; i += 1) {
    let running = appName ? deps.isProcessRunning(appName) : false
    if (!running) {
      crashRecoveryAttempts += 1
      const recovered = await attemptRecovery(config, appName, bundleId, deps)
      if (!recovered) {
        crashCount += 1
        crashRecoveryFailedCount += 1
      } else if (appName) {
        crashCount += 1
      }
      running = recovered
    }
    if (running) {
      currentInactivityWindows = 0
    } else {
      currentInactivityWindows += 1
      maxContinuousInactivityWindows = Math.max(
        maxContinuousInactivityWindows,
        currentInactivityWindows
      )
    }

    const pid = appName && running ? deps.findFirstPid(appName) : undefined
    const sample = pid ? deps.getProcessSample(pid) : undefined
    const windowCount = appName ? deps.getWindowCount(appName) : undefined
    samples.push({
      timestamp: new Date().toISOString(),
      running,
      rssMb: sample?.rssMb,
      cpuPercent: sample?.cpuPercent,
      windowCount,
    })
    await deps.sleep(Math.max(1, config.intervalSeconds) * 1000)
  }

  let quit = bundleId
    ? deps.runChecked("osascript", ["-e", `tell application id "${bundleId}" to quit`], 30000)
    : appName
      ? deps.runChecked("killall", [appName], 30000)
      : {
          ok: false,
          detail: "no quit strategy available",
          stdout: "",
          stderr: "",
        }
  if (!quit.ok && appName) {
    quit = deps.runChecked("killall", [appName])
  }

  const validRss = samples.map((s) => s.rssMb).filter((v): v is number => typeof v === "number")
  const validCpu = samples
    .map((s) => s.cpuPercent)
    .filter((v): v is number => typeof v === "number")
  const rssGrowthMb =
    validRss.length >= 2
      ? Number((validRss[validRss.length - 1] - validRss[0]).toFixed(2))
      : undefined
  const rssMaxMb = validRss.length > 0 ? Number(Math.max(...validRss).toFixed(2)) : undefined
  const cpuAvgPercent =
    validCpu.length > 0
      ? Number((validCpu.reduce((a, b) => a + b, 0) / validCpu.length).toFixed(2))
      : undefined
  const windowFluctuation = calculateWindowFluctuation(samples)
  const maxContinuousInactivitySeconds =
    maxContinuousInactivityWindows * Math.max(1, config.intervalSeconds)
  const crashCountMax = config.gates?.crashCountMax ?? 0
  const rssGrowthMbMax = config.gates?.rssGrowthMbMax
  const cpuAvgPercentMax = config.gates?.cpuAvgPercentMax
  const gateCrash = crashCount <= crashCountMax
  const gateRss =
    rssGrowthMbMax === undefined || rssGrowthMb === undefined ? true : rssGrowthMb <= rssGrowthMbMax
  const gateCpu =
    cpuAvgPercentMax === undefined || cpuAvgPercent === undefined
      ? true
      : cpuAvgPercent <= cpuAvgPercentMax
  const passed = quit.ok && gateCrash && gateRss && gateCpu
  const reasonCode = passed
    ? undefined
    : !quit.ok
      ? "desktop.soak.quit_failed"
      : !gateCrash
        ? "desktop.soak.gate.crash_count"
        : !gateRss
          ? "desktop.soak.gate.rss_growth"
          : "desktop.soak.gate.cpu_avg"

  const result: DesktopSoakResult = {
    targetType: config.targetType,
    status: passed ? "passed" : "blocked",
    reasonCode,
    durationSeconds: config.durationSeconds,
    intervalSeconds: config.intervalSeconds,
    appName,
    crashCount,
    rssGrowthMb,
    rssMaxMb,
    cpuAvgPercent,
    stabilityMetrics: {
      crashRecoveryAttempts,
      crashRecoveryFailedCount,
      maxContinuousInactivityWindows,
      maxContinuousInactivitySeconds,
      windowFluctuation,
    },
    samples,
    reportPath,
  }
  writeFileSync(resolve(baseDir, reportPath), JSON.stringify(result, null, 2), "utf8")
  return result
}
