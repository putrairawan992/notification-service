import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { FcmService } from './fcm.service';
import { FcmJob } from '../entities/fcm-job.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([FcmJob]),
  ],
  providers: [NotificationService, FcmService],
  controllers: [],
})
export class NotificationModule {}
