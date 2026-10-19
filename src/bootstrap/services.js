import { initServices } from '../state/service_loader.js'
import { applyLogSearchParams, exposeLoggerOnWindow } from '../core/log_config.js'

applyLogSearchParams()
exposeLoggerOnWindow()

await initServices()
