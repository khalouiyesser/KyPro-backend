import { Module }           from '@nestjs/common';
import { MongooseModule }   from '@nestjs/mongoose';
import { Employee, EmployeeSchema } from './employee.schema';
import { EmployeesController }      from './employees.controller';
import { EmployeesService }         from './employees.service';

// Nécessaire pour créer le compte User à la volée
import { User, UserSchema } from '../users/user.schema';

// MailService pour envoyer les identifiants par email
import { MailService }      from '../common/services/mail.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name,     schema: UserSchema },     // pour @InjectModel('User')
    ]),
  ],
  controllers: [EmployeesController],
  providers:   [EmployeesService, MailService],
  exports:     [EmployeesService],
})
export class EmployeesModule {}