import { Injectable } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  create(userId: string, createTransactionDto: CreateTransactionDto) {
    return 'This action adds a new transaction';
  }

  findAll(userId: string) {
    return `This action returns all transactions`;
  }

  findOne(userId: number) {
    return `This action returns a #${userId} transaction`;
  }

  update(userId: string, transactionId: string, updateTransactionDto: UpdateTransactionDto) {
    return `This action updates a #${transactionId} transaction`;
  }

  remove(userId: string, transactionId: string) {
    return `This action removes a #${transactionId} transaction`;
  }
}
