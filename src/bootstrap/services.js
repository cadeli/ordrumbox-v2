import Sequencer from '../logic/sequencer.js'
import Commander from '../logic/commands/commander.js'
import * as flatNotesService from '../patterns/flat_notes.js'
import ResourcesLoader from '../loader/resources_loader.js'
import { getHistoryService } from '../state/service_loader.js'
import { serviceRegistry } from '../state/service_registry.js'
import { logger } from '../core/logger.js'

logger.setLevel(logger.LEVELS?.INFO ?? 1)

serviceRegistry.cmd = new Commander()
serviceRegistry.resourcesLoader = new ResourcesLoader()
serviceRegistry.seq = new Sequencer()
serviceRegistry.flatNotes = flatNotesService
serviceRegistry.history = await getHistoryService()
