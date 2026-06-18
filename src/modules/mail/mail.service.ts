import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendMail(to: string, subject: string, html: string) {
    await this.mailerService.sendMail({
      to,
      subject,
      html,
    });
  }

  async sendWelcomeEmail(to: string, name: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Welcome to NestJS Template!',
      template: './welcome', // relative to template.dir in MailModule
      context: {
        name,
        email: to,
      },
    });
  }
}
