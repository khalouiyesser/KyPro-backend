import { Test, TestingModule } from '@nestjs/testing';
import { RasController } from './ras.controller';
import { RasService } from './ras.service';

describe('RasController', () => {
  let controller: RasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RasController],
      providers: [RasService],
    }).compile();

    controller = module.get<RasController>(RasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
