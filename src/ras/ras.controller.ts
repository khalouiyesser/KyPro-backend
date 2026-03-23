import { Controller } from '@nestjs/common';
import { RasService } from './ras.service';

@Controller('ras')
export class RasController {
  constructor(private readonly rasService: RasService) {}
}
