import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import * as path from 'path';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private auth: GoogleAuth;

  constructor(private configService: ConfigService) {
    const keyFilePath = this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS');
    
    this.auth = new GoogleAuth({
      keyFile: keyFilePath ? path.resolve(keyFilePath) : undefined,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
  }

  async sendNotification(token: string, body: string): Promise<boolean> {
    const projectId = this.configService.get<string>('FCM_PROJECT_ID');
    
    // Mock for testing without real credentials
    if (projectId === 'mock-project-id' || !projectId) {
        this.logger.log(`[MOCK] Sending FCM to ${token}: ${body}`);
        return true;
    }

    try {
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();

      const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

      const data = {
        message: {
          token: token,
          notification: {
            title: 'Incoming message',
            body: body,
          },
        },
      };

      const response = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.status === 200;
    } catch (error) {
      this.logger.error('Error sending FCM message', error.response?.data || error.message);
      throw error;
    }
  }
}