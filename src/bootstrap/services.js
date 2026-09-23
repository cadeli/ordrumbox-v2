import Sequencer from '../logic/seq.js'
import Commander from '../logic/commands/cmd.js'
import * as patternsManager from '../patterns/manager.js'
import ResourcesLoader from '../loader/resources_loader.js'
import { getHistoryService } from '../state/service_loader.js'
import { serviceRegistry } from '../state/service_registry.js'
import { logger } from '../core/logger.js'

logger.setLevel(logger.LEVELS?.INFO ?? 1)

serviceRegistry.cmd = new Commander()
serviceRegistry.resourcesLoader = new ResourcesLoader()
serviceRegistry.seq = new Sequencer()
serviceRegistry.patterns = patternsManager
serviceRegistry.history = await getHistoryService()
