import { Test, TestingModule } from '@nestjs/testing';
import { RasService } from './ras.service';

describe('RasService', () => {
  let service: RasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RasService],
    }).compile();

    service = module.get<RasService>(RasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
