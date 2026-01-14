import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';
import { FcmService } from './fcm.service';
import { FcmJob } from '../entities/fcm-job.entity';
import { FcmMessageDto } from './dto/fcm-message.dto';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: amqp.ChannelWrapper;

  constructor(
    @InjectRepository(FcmJob)
    private fcmJobRepository: Repository<FcmJob>,
    private fcmService: FcmService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.connectRabbitMQ();
  }

  async onModuleDestroy() {
    if (this.connection) {
      await this.connection.close();
    }
  }

  private connectRabbitMQ() {
    const url = this.configService.get<string>('RABBITMQ_URL');
    this.connection = amqp.connect([url]);

    this.connection.on('connect', () => this.logger.log('Connected to RabbitMQ'));
    this.connection.on('disconnect', (err) => this.logger.error('Disconnected from RabbitMQ', err.err));

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        // Assert Queue
        await channel.assertQueue('notification.fcm', { durable: true });
        // Assert Exchange (Topic)
        await channel.assertExchange('notification.done', 'topic', { durable: true });

        // Consume
        await channel.consume('notification.fcm', async (msg) => {
           if (msg) {
             await this.handleMessage(msg, channel);
           }
        });
      },
    });
  }

  private async handleMessage(msg: ConsumeMessage, channel: Channel) {
    try {
      const content = JSON.parse(msg.content.toString());
      this.logger.log(`Received message: ${JSON.stringify(content)}`);

      // Validation
      const messageDto = plainToClass(FcmMessageDto, content);
      const errors = await validate(messageDto);

      if (errors.length > 0) {
        this.logger.error(`Validation failed: ${JSON.stringify(errors)}`);
        channel.ack(msg); // Remove invalid message
        return;
      }

      // Acknowledge valid message immediately as per requirement
      channel.ack(msg);

      // Process
      await this.processNotification(messageDto);

    } catch (error) {
      this.logger.error('Error handling message', error);
      channel.ack(msg); // Ack to prevent loop on malformed JSON
    }
  }

  private async processNotification(message: FcmMessageDto) {
    try {
      // 1. Send FCM
      await this.fcmService.sendNotification(message.deviceId, message.text);

      // 2. Save to DB
      const now = new Date();
      const job = this.fcmJobRepository.create({
        identifier: message.identifier,
        deliverAt: now,
      });
      await this.fcmJobRepository.save(job);

      // 3. Publish to notification.done
      const payload = {
        identifier: message.identifier,
        deliverAt: now.toISOString(),
      };

      await this.channelWrapper.publish('notification.done', 'notification.done', payload);
      
      this.logger.log(`Notification processed and published: ${message.identifier}`);
    } catch (error) {
      this.logger.error(`Failed to process logic for ${message.identifier}`, error);
    }
  }
}
