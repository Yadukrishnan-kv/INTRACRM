import { createReadStream, existsSync } from 'node:fs';
import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../../../common/auth/public.decorator';
import { WarrantiesService } from '../../application/warranties.service';

@ApiTags('public-warranty')
@Public()
@Controller('public/warranty')
export class PublicWarrantyController {
  constructor(private readonly warranties: WarrantiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  home(@Res() res: Response) {
    res.type('html').send(this.warranties.portalHomeHtml());
  }

  @Get('portal.js')
  portalScript(@Res() res: Response) {
    res.type('application/javascript').send(this.warranties.portalScript());
  }

  @Get('jsqr.js')
  jsqr(@Res() res: Response) {
    const file = this.jsqrPath();
    if (!file) {
      res.status(404).type('text').send('jsQR not installed');
      return;
    }
    res.type('application/javascript');
    createReadStream(file).pipe(res);
  }

  @Get(':token/view')
  async view(@Param('token') token: string, @Res() res: Response) {
    try {
      const html = await this.warranties.publicViewHtml(token);
      res.type('html').send(html);
    } catch {
      res.status(404).type('html').send(this.warranties.portalNotFoundHtml());
    }
  }

  @Get(':token/pdf')
  async pdf(@Param('token') token: string, @Res() res: Response) {
    try {
      const file = await this.warranties.publicPdfFile(token);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.send(file.bytes);
    } catch {
      res.status(404).type('html').send(this.warranties.portalNotFoundHtml());
    }
  }

  @Get(':token')
  verify(@Param('token') token: string) {
    return this.warranties.verifyPublic(token);
  }

  private jsqrPath(): string | null {
    const resolved = (() => {
      try {
        return require.resolve('jsqr/dist/jsQR.js');
      } catch {
        return null;
      }
    })();
    const candidates = [resolved, `${process.cwd()}/node_modules/jsqr/dist/jsQR.js`].filter(
      (file): file is string => file != null,
    );
    return candidates.find((file) => existsSync(file)) ?? null;
  }
}
